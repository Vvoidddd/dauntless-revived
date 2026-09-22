import crypto from "node:crypto";
import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { GetDb } from "../db";
import { guildinvites, guildmembers, guilds, users } from "../db/schema";
import { logger } from "../logger";
import type { Tx } from "./savehistory";
import { IsAccountIdShape } from "./login";
import { IsBlockedEitherWayInTx } from "./friends";
import { SeenWithinMs } from "./party";

// Guilds (roadmap 3.11): the 1.4.4 client's v2 guild API (the eleven *_v2 endpoint keys in
// UndauntedInternalServer/dllmain.cpp), stored in SQLite (migration 0013_guilds) so a guild survives
// restarts and an invite waits for a player who is offline. The contract was read from the game's
// executable; docs/findings/social.md has the evidence and routes/guild.ts the routes.
//
// - Every reply is read through the Phoenix envelope {"code", "message", "payload"}. Success is a
//   2xx status AND a JSON body, so a success never answers 204. On an error status the client maps
//   "code" to its EGuildRequestError and shows the matching text; an unknown or empty code shows as
//   "Unable to create guild."
// - Replies that carry a guild or the invite list also copy the payload's fields to the root, in case
//   the client reads them flat (the envelope reader ignores extra root keys).
// - A guild is created by the Ramsgate game server (the Create button is an RPC to it), with the
//   game-server key. The game server passes on the leader id the client sent, so a create is only
//   accepted for a player who validated a name in the last 15 minutes or was heard from in the last
//   minute (party polls, heartbeats).
// - Other members and invitees see a change at their next GET /guild or GET /guild/invite/player
//   (login, world load, or their own guild action): the client gets no push.
//
// In memory only (losing them on a restart is harmless): validate tickets, the creation and invite
// rate windows.

// The codes the server sends, and the EGuildRequestError each maps to in the client
export const GUILD_CODE = {
    InvalidPermission: "SlyAdorableQuillshot",
    NotInAGuild: "ExcludedAdorableQuillshot",
    NameInvalidLength: "ObedientAdorableQuillshot",
    NameTaken: "SeizedAdorableQuillshot",
    NameProfane: "NastyAdorableQuillshot",
    NameTooManyNumbers: "NumberedAdorableQuillshot",
    NameTooManyLetters: "LetteredAdorableQuillshot",
    NameplateInvalidLength: "DutifulAdorableQuillshot",
    NameplateTaken: "CapturedAdorableQuillshot",
    NameplateProfane: "DirtyAdorableQuillshot",
    AlreadyInAGuild: "OccupiedAdorableQuillshot",
    TargetAlreadyInYourGuild: "ClonedAdorableQuillshot",
    TargetAlreadyHasGuildInvite: "RedundantAdorableQuillshot",
    GuildIsFull: "StuffedAdorableQuillshot",
    InviteNotFound: "UninvitedAdorableQuillshot",
    LeaderCannotLeave: "ChiefAdorableQuillshot",
    InvalidRank: "DocileAdorableQuillshot",
    Unknown: ""
} as const;

type GuildCode = typeof GUILD_CODE[keyof typeof GUILD_CODE];

// The client's own texts where it has one (the create-guild widget), else a short reason
const MESSAGES: Record<string, string> = {
    [GUILD_CODE.InvalidPermission]: "You do not have permission to do that.",
    [GUILD_CODE.NotInAGuild]: "Not in that guild.",
    [GUILD_CODE.NameInvalidLength]: "Name is invalid. Must contain 4-15 english letters and digits.",
    [GUILD_CODE.NameTaken]: "Guild name already in use.",
    [GUILD_CODE.NameProfane]: "Guild name contains profanity.",
    [GUILD_CODE.NameTooManyNumbers]: "Guild name must have 6 numbers or less.",
    [GUILD_CODE.NameTooManyLetters]: "Guild name must not have more than 6 of the same letter in a row.",
    [GUILD_CODE.NameplateInvalidLength]: "Nameplate is invalid. Must contain 2-6 english letters and digits.",
    [GUILD_CODE.NameplateTaken]: "Guild nameplate already in use.",
    [GUILD_CODE.NameplateProfane]: "Guild nameplate contains profanity.",
    [GUILD_CODE.AlreadyInAGuild]: "Unable to create guild. You are already in a guild.",
    [GUILD_CODE.TargetAlreadyInYourGuild]: "That player is already in your guild.",
    [GUILD_CODE.TargetAlreadyHasGuildInvite]: "That player already has an invite from your guild.",
    [GUILD_CODE.GuildIsFull]: "The guild is full.",
    [GUILD_CODE.InviteNotFound]: "Guild invite not found.",
    [GUILD_CODE.LeaderCannotLeave]: "The guild leader cannot leave the guild.",
    [GUILD_CODE.InvalidRank]: "Invalid guild rank."
};

export const DEFAULT_MAX_MEMBERS = 100;
export const DEFAULT_INVITE_TTL_DAYS = 7;
export const MAX_OPEN_INVITES_PER_GUILD = 50;
export const MAX_OPEN_INVITES_PER_INVITEE = 20;
export const MAX_INVITES_PER_INVITER_PER_HOUR = 30;
export const CREATE_INTERVAL_MS = 10 * 60 * 1000;
export const VALIDATE_TICKET_MS = 15 * 60 * 1000;
export const CREATE_ACTIVITY_MS = 60 * 1000;

export type GuildRank = "Member" | "Officer" | "Leader";

// The guild object of every guild reply (FGuildData / FGuildMemberData in the client). Every field is
// a string except maximum_guild_members, a JSON number.
export type GuildData = {
    id: string,
    name: string,
    nameplate: string,
    leader_account_id: string,
    members: { phx_account_id: string, rank: string }[],
    maximum_guild_members: number
};

export type GuildInviteData = { id: string, guild_id: string, guild_name: string, inviter_account_id: string };

// Status and body for the route; Body undefined answers no body (only GET /guild's "no guild")
export type GuildReply = { Status: number, Body: unknown, Code?: GuildCode };

// ---- Settings ----

export function MaxGuildMembers(){
    const Value = Number(process.env.GUILD_MAX_MEMBERS);

    return Number.isInteger(Value) && Value >= 1 && Value <= 10000 ? Value : DEFAULT_MAX_MEMBERS;
}

export function GuildInviteTtlMs(){
    const Value = Number(process.env.GUILD_INVITE_TTL_DAYS);
    const Days = Number.isFinite(Value) && Value > 0 && Value <= 365 ? Value : DEFAULT_INVITE_TTL_DAYS;

    return Math.round(Days * 24 * 60 * 60 * 1000);
}

// ---- In memory ----

type ValidateTicket = { NameKey: string, NameplateKey: string, At: number };

const Tickets = new Map<string, ValidateTicket>();
const LastCreated = new Map<string, number>();
const InvitesSent = new Map<string, number[]>();
let Clock: () => number = () => Date.now();
let LastSweep = 0;

export function GuildNow(){
    return Clock();
}

// Tests only: a controllable clock (also used for invite expiry), and empty in-memory state
export function SetGuildClockForTests(NewClock?: () => number){
    Clock = NewClock ?? (() => Date.now());
}

export function ResetGuildMemoryForTests(){
    Tickets.clear();
    LastCreated.clear();
    InvitesSent.clear();
    LastSweep = 0;
}

function ForgetOldMemory(Now: number){
    for(const [Account, Ticket] of [...Tickets.entries()]){
        if(Now - Ticket.At > VALIDATE_TICKET_MS) Tickets.delete(Account);
    }

    for(const [Account, At] of [...LastCreated.entries()]){
        if(Now - At > CREATE_INTERVAL_MS) LastCreated.delete(Account);
    }

    for(const [Account, Times] of [...InvitesSent.entries()]){
        const Recent = Times.filter((At) => Now - At < 60 * 60 * 1000);

        if(Recent.length > 0) InvitesSent.set(Account, Recent);
        else InvitesSent.delete(Account);
    }
}

// At most once a minute: delete expired invites and forget old in-memory entries
function Sweep(){
    const Now = Clock();

    if(Now - LastSweep < 60 * 1000){
        return;
    }

    LastSweep = Now;
    ForgetOldMemory(Now);

    const Removed = GetDb().delete(guildinvites).where(lte(guildinvites.expiresAt, Now)).returning({ inviteId: guildinvites.inviteId }).all();

    if(Removed.length > 0){
        logger.info(`guild: removed ${Removed.length} expired invite(s)`);
    }
}

// ---- Replies ----

function Envelope(Payload: object){
    return { code: "OK", message: "", payload: Payload };
}

function Ack(): GuildReply {
    return { Status: 200, Body: Envelope({}) };
}

// Wrapped, plus flat copies of the payload's fields at the root
function WithPayload(Payload: Record<string, unknown>): GuildReply {
    return { Status: 200, Body: { ...Envelope(Payload), ...Payload } };
}

function Refuse(Status: number, Code: GuildCode, Message?: string): GuildReply {
    return { Status: Status, Body: { code: Code, message: Message ?? MESSAGES[Code] ?? "", payload: {} }, Code: Code };
}

function Describe(Reply: GuildReply){
    return Reply.Status < 300 ? `${Reply.Status}` : `${Reply.Status} ${Reply.Code === "" ? "(no code)" : Reply.Code}`;
}

// A name as typed, safe for one log line
function Quoted(Value: unknown){
    return typeof Value === "string" ? JSON.stringify(Value.slice(0, 32)) : `<${typeof Value}>`;
}

// ---- Names and nameplates ----

const NAME_RULE = /^[A-Za-z0-9]{4,15}$/;
const NAMEPLATE_RULE = /^[A-Za-z0-9]{2,6}$/;
const MAX_DIGITS = 6;
const MAX_RUN = 6;

// A short list; GUILD_NAME_DENYLIST adds more. Compared after lowercasing and undoing common digit
// swaps, as a substring, so keep entries long enough not to hit ordinary words.
const BUILT_IN_DENYLIST = [
    "fuck", "shit", "cunt", "bitch", "whore", "slut", "nigger", "nigga", "faggot", "retard",
    "nazi", "hitler", "penis", "vagina", "pussy", "dildo", "twat", "wank", "porn", "kike"
];

function Unleet(Text: string){
    return Text.toLowerCase().replace(/[013457]/g, (Digit) => ({ "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" } as Record<string, string>)[Digit]);
}

function Denylist(){
    const Extra = (process.env.GUILD_NAME_DENYLIST ?? "").split(",").map((Word) => Unleet(Word.trim())).filter((Word) => /^[a-z0-9]{2,32}$/.test(Word));

    return [...BUILT_IN_DENYLIST, ...Extra];
}

export function IsProfaneGuildText(Text: string){
    const Plain = Unleet(Text);

    return Denylist().some((Word) => Plain.includes(Word));
}

function LongestRun(Text: string){
    const Lower = Text.toLowerCase();
    let Longest = 0;
    let Run = 0;

    for(let Index = 0; Index < Lower.length; Index++){
        Run = Index > 0 && Lower[Index] === Lower[Index - 1] ? Run + 1 : 1;
        Longest = Math.max(Longest, Run);
    }

    return Longest;
}

type CheckedName = { Name: string, NameKey: string, Nameplate: string, NameplateKey: string | null };

// The name and nameplate rules, in the order the first failure decides. The caller checks
// "already in a guild" first. An empty nameplate is allowed (the client skips it when empty).
function CheckNameAndNameplate(tx: Tx, Name: unknown, Nameplate: unknown): CheckedName | GuildReply {
    if(typeof Name !== "string" || !NAME_RULE.test(Name)){
        return Refuse(400, GUILD_CODE.NameInvalidLength);
    }

    if((Name.match(/[0-9]/g) ?? []).length > MAX_DIGITS){
        return Refuse(400, GUILD_CODE.NameTooManyNumbers);
    }

    if(LongestRun(Name) > MAX_RUN){
        return Refuse(400, GUILD_CODE.NameTooManyLetters);
    }

    if(IsProfaneGuildText(Name)){
        return Refuse(400, GUILD_CODE.NameProfane);
    }

    const NameKey = Name.toLowerCase();

    if(tx.select({ guildId: guilds.guildId }).from(guilds).where(eq(guilds.nameKey, NameKey)).get() !== undefined){
        return Refuse(409, GUILD_CODE.NameTaken);
    }

    const Plate = Nameplate === undefined || Nameplate === null ? "" : Nameplate;

    if(typeof Plate !== "string" || (Plate.length > 0 && !NAMEPLATE_RULE.test(Plate))){
        return Refuse(400, GUILD_CODE.NameplateInvalidLength);
    }

    if(Plate.length === 0){
        return { Name: Name, NameKey: NameKey, Nameplate: "", NameplateKey: null };
    }

    if(IsProfaneGuildText(Plate)){
        return Refuse(400, GUILD_CODE.NameplateProfane);
    }

    const NameplateKey = Plate.toLowerCase();

    if(tx.select({ guildId: guilds.guildId }).from(guilds).where(eq(guilds.nameplateKey, NameplateKey)).get() !== undefined){
        return Refuse(409, GUILD_CODE.NameplateTaken);
    }

    return { Name: Name, NameKey: NameKey, Nameplate: Plate, NameplateKey: NameplateKey };
}

function IsReply(Value: CheckedName | GuildReply): Value is GuildReply {
    return (Value as GuildReply).Status !== undefined;
}

// ---- Reading ----

const RANK_ORDER: Record<string, number> = { Leader: 0, Officer: 1, Member: 2 };

function NormalizeRank(Rank: unknown): GuildRank | undefined {
    if(typeof Rank !== "string"){
        return undefined;
    }

    switch(Rank.toLowerCase()){
        case "member": return "Member";
        case "officer": return "Officer";
        case "leader": return "Leader";
        default: return undefined;
    }
}

function MembershipOf(tx: Tx, AccountId: string){
    return tx.select().from(guildmembers).where(eq(guildmembers.accountId, AccountId)).get();
}

function MemberCount(tx: Tx, GuildId: string){
    return tx.select({ n: sql<number>`count(*)` }).from(guildmembers).where(eq(guildmembers.guildId, GuildId)).get()?.n ?? 0;
}

function AccountExists(tx: Tx, AccountId: string){
    return tx.select({ userId: users.userId }).from(users).where(eq(users.userId, AccountId)).get() !== undefined;
}

function GuildDataInTx(tx: Tx, GuildId: string): GuildData | undefined {
    const Row = tx.select().from(guilds).where(eq(guilds.guildId, GuildId)).get();

    if(Row === undefined){
        return undefined;
    }

    const Members = tx.select().from(guildmembers).where(eq(guildmembers.guildId, GuildId)).all()
        .sort((A, B) => (RANK_ORDER[A.rank] ?? 3) - (RANK_ORDER[B.rank] ?? 3) || A.joinedAt - B.joinedAt || A.accountId.localeCompare(B.accountId));

    return {
        id: Row.guildId,
        name: Row.name,
        nameplate: Row.nameplate,
        leader_account_id: Row.leaderId,
        members: Members.map((Member) => ({ phx_account_id: Member.accountId, rank: Member.rank })),
        maximum_guild_members: Math.max(MaxGuildMembers(), Members.length)
    };
}

function LiveInvite(tx: Tx, GuildId: string, InviteeId: string, Now: number){
    return tx.select().from(guildinvites).where(and(eq(guildinvites.guildId, GuildId), eq(guildinvites.inviteeId, InviteeId), gt(guildinvites.expiresAt, Now))).get();
}

// GET /guild: the caller's guild, or 204 (no body) when there is none. A 204 fails the client's parse,
// which is how it learns "no guild" (it then clears its guild), as with the old stub.
export function GetOwnGuild(UserId: string | undefined): GuildReply {
    if(UserId === undefined){
        return { Status: 204, Body: undefined };
    }

    const Data = GetDb().transaction((tx) => {
        const Membership = MembershipOf(tx, UserId);

        return Membership === undefined ? undefined : GuildDataInTx(tx, Membership.guildId);
    });

    return Data === undefined ? { Status: 204, Body: undefined } : WithPayload(Data);
}

// GET /guild/invite/player: the caller's open invites, newest first
export function ListOwnGuildInvites(UserId: string | undefined): GuildReply {
    Sweep();

    const Now = Clock();
    const Invites: GuildInviteData[] = UserId === undefined ? [] : GetDb()
        .select({ inviteId: guildinvites.inviteId, guildId: guildinvites.guildId, guildName: guilds.name, inviterId: guildinvites.inviterId })
        .from(guildinvites)
        .innerJoin(guilds, eq(guilds.guildId, guildinvites.guildId))
        .where(and(eq(guildinvites.inviteeId, UserId), gt(guildinvites.expiresAt, Now)))
        .orderBy(desc(guildinvites.createdAt), asc(guildinvites.inviteId))
        .all()
        .map((Row) => ({ id: Row.inviteId, guild_id: Row.guildId, guild_name: Row.guildName, inviter_account_id: Row.inviterId }));

    return WithPayload({ invites: Invites });
}

// ---- Creating ----

// POST /guild/validate {leader_account_id, name, nameplate}: the create widget checks the name while
// the player types. The token's account decides; a different leader in the body is only logged.
export function ValidateGuildCreate(UserId: string, BodyLeader: unknown, Name: unknown, Nameplate: unknown): GuildReply {
    Sweep();

    if(typeof BodyLeader === "string" && BodyLeader.length > 0 && BodyLeader !== UserId){
        logger.info(`guild: validate by ${UserId} names leader ${IsAccountIdShape(BodyLeader) ? BodyLeader : "<not an account id>"}; checking the caller`);
    }

    const Now = Clock();
    const Result = GetDb().transaction((tx): CheckedName | GuildReply => {
        if(MembershipOf(tx, UserId) !== undefined){
            return Refuse(409, GUILD_CODE.AlreadyInAGuild);
        }

        return CheckNameAndNameplate(tx, Name, Nameplate);
    });

    if(IsReply(Result)){
        logger.info(`guild: validate by ${UserId} name=${Quoted(Name)} tag=${Quoted(Nameplate ?? "")} -> ${Describe(Result)}`);
        return Result;
    }

    Tickets.set(UserId, { NameKey: Result.NameKey, NameplateKey: Result.NameplateKey ?? "", At: Now });
    logger.info(`guild: validate by ${UserId} name=${Quoted(Name)} tag=${Quoted(Nameplate ?? "")} -> ok`);

    return Ack();
}

// POST /guild from the game server (the client's Create button is the RPC ServerCreateGuild on the
// Ramsgate server, which sends this with the game-server key). BearerUserId is the player token the
// game server may have forwarded (undefined without one or when it was not valid).
export function CreateGuild(Leader: unknown, BearerUserId: string | undefined, Name: unknown, Nameplate: unknown): GuildReply {
    Sweep();

    const Now = Clock();
    const LogRefusal = (Reply: GuildReply, Why: string) => {
        logger.info(`guild: create for ${IsAccountIdShape(Leader) ? Leader : "<not an account id>"} name=${Quoted(Name)} tag=${Quoted(Nameplate ?? "")} refused ${Describe(Reply)}: ${Why}`);
        return Reply;
    };

    if(!IsAccountIdShape(Leader) || !GetDb().transaction((tx) => AccountExists(tx, Leader))){
        return LogRefusal(Refuse(400, GUILD_CODE.Unknown, "No such account."), "no such account");
    }

    if(BearerUserId !== undefined && BearerUserId !== Leader){
        return LogRefusal(Refuse(403, GUILD_CODE.InvalidPermission), `the forwarded token is ${BearerUserId}'s`);
    }

    const Ticket = Tickets.get(Leader);
    const HasTicket = Ticket !== undefined && Now - Ticket.At <= VALIDATE_TICKET_MS;

    if(!HasTicket && !SeenWithinMs(Leader, CREATE_ACTIVITY_MS)){
        return LogRefusal(Refuse(403, GUILD_CODE.InvalidPermission), "no recent validate or activity");
    }

    let Result: GuildData | GuildReply;

    try{
        Result = GetDb().transaction((tx): GuildData | GuildReply => {
            if(MembershipOf(tx, Leader) !== undefined){
                return Refuse(409, GUILD_CODE.AlreadyInAGuild);
            }

            const Checked = CheckNameAndNameplate(tx, Name, Nameplate);

            if(IsReply(Checked)){
                return Checked;
            }

            const Previous = LastCreated.get(Leader);

            if(Previous !== undefined && Now - Previous < CREATE_INTERVAL_MS){
                return Refuse(429, GUILD_CODE.Unknown, "A guild was created a moment ago; try again later.");
            }

            const GuildId = crypto.randomUUID();

            tx.insert(guilds).values({ guildId: GuildId, name: Checked.Name, nameKey: Checked.NameKey, nameplate: Checked.Nameplate, nameplateKey: Checked.NameplateKey, leaderId: Leader, createdAt: Now, updatedAt: Now }).run();
            tx.insert(guildmembers).values({ accountId: Leader, guildId: GuildId, rank: "Leader", joinedAt: Now, updatedAt: Now }).run();
            tx.delete(guildinvites).where(eq(guildinvites.inviteeId, Leader)).run();

            return GuildDataInTx(tx, GuildId)!;
        });
    }
    catch(error: any){
        // A unique index refusing the insert (a name or nameplate taken in between); anything else is a real error
        if(typeof error?.code !== "string" || !error.code.startsWith("SQLITE_CONSTRAINT")){
            throw error;
        }

        logger.warn(`guild: create for ${Leader} refused by the database: ${error.code}`);
        return Refuse(409, GUILD_CODE.NameTaken);
    }

    if((Result as GuildReply).Status !== undefined){
        return LogRefusal(Result as GuildReply, "checks");
    }

    const Data = Result as GuildData;

    LastCreated.set(Leader, Now);
    Tickets.delete(Leader);
    logger.info(`guild: created G=${Data.id} name=${Data.name} tag=${Data.nameplate} leader=${Leader}${BearerUserId !== undefined ? " (with the player's token)" : ""}`);

    return WithPayload(Data);
}

// ---- Membership ----

// DELETE /guild/:guildId: the leader disbands their own guild
export function DisbandGuild(UserId: string, GuildId: unknown): GuildReply {
    const Result = GetDb().transaction((tx): GuildReply => {
        const Membership = MembershipOf(tx, UserId);

        if(Membership === undefined || Membership.guildId !== GuildId){
            return Refuse(404, GUILD_CODE.NotInAGuild);
        }

        if(Membership.rank !== "Leader"){
            return Refuse(403, GUILD_CODE.InvalidPermission);
        }

        RemoveGuildInTx(tx, Membership.guildId);
        return Ack();
    });

    logger.info(`guild: disband G=${typeof GuildId === "string" ? GuildId.slice(0, 64) : "<none>"} by=${UserId} -> ${Describe(Result)}`);

    return Result;
}

function RemoveGuildInTx(tx: Tx, GuildId: string){
    const Members = tx.delete(guildmembers).where(eq(guildmembers.guildId, GuildId)).returning({ accountId: guildmembers.accountId }).all();

    tx.delete(guildinvites).where(eq(guildinvites.guildId, GuildId)).run();
    tx.delete(guilds).where(eq(guilds.guildId, GuildId)).run();

    return Members.length;
}

function RecentInvitesBy(InviterId: string, Now: number){
    return (InvitesSent.get(InviterId) ?? []).filter((At) => Now - At < 60 * 60 * 1000);
}

// PUT /guild/invite/:accountId: a Leader or Officer invites a player to their guild
export function InviteToGuild(UserId: string, TargetId: unknown): GuildReply {
    Sweep();

    const Now = Clock();
    const Result = GetDb().transaction((tx): GuildReply => {
        const Membership = MembershipOf(tx, UserId);

        if(Membership === undefined){
            return Refuse(404, GUILD_CODE.NotInAGuild);
        }

        if(Membership.rank !== "Leader" && Membership.rank !== "Officer"){
            return Refuse(403, GUILD_CODE.InvalidPermission);
        }

        if(!IsAccountIdShape(TargetId) || !AccountExists(tx, TargetId)){
            return Refuse(404, GUILD_CODE.Unknown, "No such account.");
        }

        const Target = MembershipOf(tx, TargetId);

        if(TargetId === UserId || Target?.guildId === Membership.guildId){
            return Refuse(409, GUILD_CODE.TargetAlreadyInYourGuild);
        }

        if(IsBlockedEitherWayInTx(tx, UserId, TargetId)){
            return Refuse(403, GUILD_CODE.Unknown, "One of the two has blocked the other.");
        }

        if(MemberCount(tx, Membership.guildId) >= MaxGuildMembers()){
            return Refuse(409, GUILD_CODE.GuildIsFull);
        }

        if(LiveInvite(tx, Membership.guildId, TargetId, Now) !== undefined){
            return Refuse(409, GUILD_CODE.TargetAlreadyHasGuildInvite);
        }

        const OpenForGuild = tx.select({ n: sql<number>`count(*)` }).from(guildinvites)
            .where(and(eq(guildinvites.guildId, Membership.guildId), gt(guildinvites.expiresAt, Now))).get()?.n ?? 0;

        if(OpenForGuild >= MAX_OPEN_INVITES_PER_GUILD){
            return Refuse(429, GUILD_CODE.Unknown, "Too many open invites for this guild.");
        }

        if(RecentInvitesBy(UserId, Now).length >= MAX_INVITES_PER_INVITER_PER_HOUR){
            return Refuse(429, GUILD_CODE.Unknown, "Too many guild invites sent in the last hour; try again later.");
        }

        // An expired invite for the same pair gives way; the invitee keeps at most the newest 20
        tx.delete(guildinvites).where(and(eq(guildinvites.guildId, Membership.guildId), eq(guildinvites.inviteeId, TargetId))).run();

        const Pending = tx.select({ inviteId: guildinvites.inviteId }).from(guildinvites)
            .where(and(eq(guildinvites.inviteeId, TargetId), gt(guildinvites.expiresAt, Now)))
            .orderBy(asc(guildinvites.createdAt), asc(guildinvites.inviteId)).all();

        for(const Old of Pending.slice(0, Math.max(0, Pending.length - (MAX_OPEN_INVITES_PER_INVITEE - 1)))){
            tx.delete(guildinvites).where(eq(guildinvites.inviteId, Old.inviteId)).run();
        }

        tx.insert(guildinvites).values({ inviteId: crypto.randomUUID(), guildId: Membership.guildId, inviteeId: TargetId, inviterId: UserId, createdAt: Now, expiresAt: Now + GuildInviteTtlMs() }).run();

        return Ack();
    });

    if(Result.Status === 200){
        InvitesSent.set(UserId, [...RecentInvitesBy(UserId, Now), Now]);
    }

    logger.info(`guild: invite by=${UserId} to=${IsAccountIdShape(TargetId) ? TargetId : "<not an account id>"} -> ${Describe(Result)}`);

    return Result;
}

// POST /guild/invite/accept/:guild_invite_id: the invitee joins as a Member; all their other invites go
export function AcceptGuildInvite(UserId: string, InviteId: unknown): GuildReply {
    const Now = Clock();
    let GuildId = "";

    const Result = GetDb().transaction((tx): GuildReply => {
        const Invite = typeof InviteId === "string" ? tx.select().from(guildinvites).where(eq(guildinvites.inviteId, InviteId)).get() : undefined;

        if(Invite === undefined || Invite.inviteeId !== UserId || Invite.expiresAt <= Now){
            return Refuse(404, GUILD_CODE.InviteNotFound);
        }

        GuildId = Invite.guildId;

        if(MembershipOf(tx, UserId) !== undefined){
            return Refuse(409, GUILD_CODE.AlreadyInAGuild, "You need to leave your guild before accepting another guild invite.");
        }

        if(tx.select({ guildId: guilds.guildId }).from(guilds).where(eq(guilds.guildId, Invite.guildId)).get() === undefined){
            tx.delete(guildinvites).where(eq(guildinvites.inviteId, Invite.inviteId)).run();
            return Refuse(404, GUILD_CODE.InviteNotFound);
        }

        if(MemberCount(tx, Invite.guildId) >= MaxGuildMembers()){
            return Refuse(409, GUILD_CODE.GuildIsFull);
        }

        tx.insert(guildmembers).values({ accountId: UserId, guildId: Invite.guildId, rank: "Member", joinedAt: Now, updatedAt: Now }).run();
        tx.delete(guildinvites).where(eq(guildinvites.inviteeId, UserId)).run();

        return Ack();
    });

    logger.info(`guild: accept by=${UserId}${GuildId !== "" ? ` G=${GuildId}` : ""} -> ${Describe(Result)}`);

    return Result;
}

// DELETE /guild/invite/:guild_invite_id: the invitee declines (an expired invite of theirs is simply removed)
export function DeclineGuildInvite(UserId: string, InviteId: unknown): GuildReply {
    const Result = GetDb().transaction((tx): GuildReply => {
        const Invite = typeof InviteId === "string" ? tx.select().from(guildinvites).where(eq(guildinvites.inviteId, InviteId)).get() : undefined;

        if(Invite === undefined || Invite.inviteeId !== UserId){
            return Refuse(404, GUILD_CODE.InviteNotFound);
        }

        tx.delete(guildinvites).where(eq(guildinvites.inviteId, Invite.inviteId)).run();
        return Ack();
    });

    logger.info(`guild: decline by=${UserId} -> ${Describe(Result)}`);

    return Result;
}

function LeaveInTx(tx: Tx, UserId: string, Membership: { rank: string }): GuildReply {
    if(Membership.rank === "Leader"){
        return Refuse(409, GUILD_CODE.LeaderCannotLeave);
    }

    tx.delete(guildmembers).where(eq(guildmembers.accountId, UserId)).run();
    return Ack();
}

// DELETE /guild/player: a Member or Officer leaves (the leader disbands, or hands over first)
export function LeaveGuild(UserId: string): GuildReply {
    const Result = GetDb().transaction((tx): GuildReply => {
        const Membership = MembershipOf(tx, UserId);

        return Membership === undefined ? Refuse(404, GUILD_CODE.NotInAGuild) : LeaveInTx(tx, UserId, Membership);
    });

    logger.info(`guild: leave by=${UserId} -> ${Describe(Result)}`);

    return Result;
}

// DELETE /guild/player/:accountId: the leader removes a member (naming oneself is a leave)
export function KickGuildMember(UserId: string, TargetId: unknown): GuildReply {
    const Result = GetDb().transaction((tx): GuildReply => {
        const Membership = MembershipOf(tx, UserId);

        if(Membership === undefined){
            return Refuse(404, GUILD_CODE.NotInAGuild);
        }

        if(TargetId === UserId){
            return LeaveInTx(tx, UserId, Membership);
        }

        if(Membership.rank !== "Leader"){
            return Refuse(403, GUILD_CODE.InvalidPermission);
        }

        const Target = IsAccountIdShape(TargetId) ? MembershipOf(tx, TargetId) : undefined;

        if(Target === undefined || Target.guildId !== Membership.guildId){
            return Refuse(404, GUILD_CODE.NotInAGuild);
        }

        tx.delete(guildmembers).where(eq(guildmembers.accountId, Target.accountId)).run();
        return Ack();
    });

    logger.info(`guild: kick by=${UserId} target=${IsAccountIdShape(TargetId) ? TargetId : "<not an account id>"} -> ${Describe(Result)}`);

    return Result;
}

// PUT /guild/rank/:accountId/:rank (member, officer or leader, any case): leader only. Making someone
// leader hands the guild over; the old leader becomes an Officer.
export function ChangeGuildRank(UserId: string, TargetId: unknown, RankValue: unknown): GuildReply {
    const Now = Clock();
    const Result = GetDb().transaction((tx): GuildReply => {
        const Membership = MembershipOf(tx, UserId);

        if(Membership === undefined){
            return Refuse(404, GUILD_CODE.NotInAGuild);
        }

        if(Membership.rank !== "Leader"){
            return Refuse(403, GUILD_CODE.InvalidPermission);
        }

        const Rank = NormalizeRank(RankValue);

        if(Rank === undefined){
            return Refuse(400, GUILD_CODE.InvalidRank);
        }

        const Target = IsAccountIdShape(TargetId) ? MembershipOf(tx, TargetId) : undefined;

        if(Target === undefined || Target.guildId !== Membership.guildId){
            return Refuse(404, GUILD_CODE.NotInAGuild);
        }

        if(Target.accountId === UserId){
            return Refuse(403, GUILD_CODE.InvalidPermission);
        }

        if(Target.rank === Rank){
            return Ack();
        }

        tx.update(guildmembers).set({ rank: Rank, updatedAt: Now }).where(eq(guildmembers.accountId, Target.accountId)).run();

        if(Rank === "Leader"){
            tx.update(guildmembers).set({ rank: "Officer", updatedAt: Now }).where(eq(guildmembers.accountId, UserId)).run();
            tx.update(guilds).set({ leaderId: Target.accountId, updatedAt: Now }).where(eq(guilds.guildId, Membership.guildId)).run();
        }

        return Ack();
    });

    logger.info(`guild: rank by=${UserId} target=${IsAccountIdShape(TargetId) ? TargetId : "<not an account id>"} rank=${Quoted(RankValue)} -> ${Describe(Result)}`);

    return Result;
}

// ---- Host fallbacks (routes/undauntedapi.ts) ----

export type GuildSummary = { guildId: string, name: string, nameplate: string, leader: string, members: number };

export function GuildNameOf(UserId: string): string | undefined {
    return GetDb().transaction((tx) => {
        const Membership = MembershipOf(tx, UserId);

        return Membership === undefined ? undefined : tx.select({ name: guilds.name }).from(guilds).where(eq(guilds.guildId, Membership.guildId)).get()?.name;
    });
}

// Every guild, by name
export function ListGuilds(): GuildSummary[] {
    return GetDb().transaction((tx) => tx.select().from(guilds).orderBy(asc(guilds.nameKey)).all().map((Row) => ({
        guildId: Row.guildId,
        name: Row.name,
        nameplate: Row.nameplate,
        leader: Row.leaderId,
        members: MemberCount(tx, Row.guildId)
    })));
}

// An admin removes a guild named by id or by name (any case): its members, invites and the guild
export function DisbandGuildAsAdmin(Guild: unknown): { Name: string, Members: number } | undefined {
    if(typeof Guild !== "string" || Guild.length === 0 || Guild.length > 64){
        return undefined;
    }

    const Result = GetDb().transaction((tx) => {
        const Row = tx.select().from(guilds).where(eq(guilds.guildId, Guild)).get()
            ?? tx.select().from(guilds).where(eq(guilds.nameKey, Guild.toLowerCase())).get();

        return Row === undefined ? undefined : { Name: Row.name, Members: RemoveGuildInTx(tx, Row.guildId), GuildId: Row.guildId };
    });

    if(Result !== undefined){
        logger.info(`guild: G=${Result.GuildId} name=${Result.Name} disbanded by an admin (${Result.Members} member(s))`);
    }

    return Result === undefined ? undefined : { Name: Result.Name, Members: Result.Members };
}

import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
    userId: text("userId").notNull().primaryKey(),
    name: text("name").notNull(),
    notes: integer("notes").notNull(),
    isAdmin: integer("isAdmin", {mode: "boolean"}).notNull().default(false)
})

export const characters = sqliteTable("characters", {
    characterId: text("characterId").notNull().primaryKey(),
    userId: text("userId").notNull(),
    createdDate: text("createdDate").notNull(),
    lastModifiedDate: text("lastModifiedDate").notNull(),
    name: text("name").notNull(),
    updateVersion: integer("updateVersion").notNull(),
    data: text("data").notNull()
});

export const inventory = sqliteTable("inventories", {
    characterId: text("characterId").notNull().primaryKey(),
    instancedItems: text("instancedItems").notNull(),
    stackedItems: text("stackedItems").notNull()
});

export const loadouts = sqliteTable("loadouts", {
    characterId: text("characterId").notNull().primaryKey(),
    userId: text("userId").notNull(),
    loadouts: text("loadouts").notNull(),
    persistent: text("persistent").notNull()
});

export const gameserverapikeys = sqliteTable("gameserverapikeys", {
    id: integer("id").notNull().primaryKey({autoIncrement: true}),
    keyHash: text("keyHash")
});

export const userapikeys = sqliteTable("userapikeys", {
    userId: text("userId").notNull().primaryKey(),
    keyHash: text("keyHash").notNull()
});

export const userapikeystoregister = sqliteTable("userapikeystoregister", {
    userId: text("userId").notNull().primaryKey(),
    key: text("key").notNull()
});

export const gameserverapikeystoregister = sqliteTable("gameserverapikeystoregister", {
    key: text("key").primaryKey()
});

export const breadcrumbs = sqliteTable("breadcrumbs", {
    characterId: text("characterId").notNull().primaryKey(),
    userId: text("userId").notNull(),
    breadcrumbs: text("breadcrumbs").notNull(),
    updateVersion: integer("updateVersion").notNull()
});

export const encounteredcontent = sqliteTable("encounteredcontent", {
    characterId: text("characterId").notNull().primaryKey(),
    userId: text("userId").notNull(),
    encounteredcontent: text("encounteredcontent").notNull()
});

export const invitecodes = sqliteTable("invitecodes", {
    inviteCode: text("invitecode").notNull().primaryKey(),
    usesRemaining: integer("usesRemaining").notNull(),
    infiniteUses: integer("infiniteUses", {mode: "boolean"}).notNull()
});

// Result of every applied inventory transaction, so a retried request gets the
// stored answer instead of running twice. Keyed by the request body as well as
// the id: only an identical request is a retry.
export const inventorytransactions = sqliteTable("inventorytransactions", {
    id: integer("id").notNull().primaryKey({autoIncrement: true}),
    transactionId: text("transactionId").notNull(),
    characterId: text("characterId").notNull(),
    userId: text("userId").notNull(),
    requestHash: text("requestHash").notNull(),
    status: integer("status").notNull(),
    response: text("response").notNull(),
    createdDate: text("createdDate").notNull()
}, (table) => [
    uniqueIndex("inventorytransactions_character_transaction_request").on(table.characterId, table.transactionId, table.requestHash)
]);

// Append-only log of every item change (triggers in the migration refuse UPDATE and DELETE)
export const inventorylog = sqliteTable("inventorylog", {
    id: integer("id").notNull().primaryKey({autoIncrement: true}),
    time: text("time").notNull(),
    userId: text("userId").notNull(),
    characterId: text("characterId").notNull(),
    transactionId: text("transactionId"),
    source: text("source"),
    caller: text("caller").notNull(),
    operation: text("operation").notNull(),
    catalogId: text("catalogId"),
    instanceId: text("instanceId"),
    quantityChange: integer("quantityChange"),
    quantityAfter: integer("quantityAfter"),
    updateVersion: integer("updateVersion")
}, (table) => [
    index("inventorylog_character").on(table.characterId, table.id)
]);

// Saved versions of each character's data blob (what is kept: controllers/savehistory.ts)
export const characterhistory = sqliteTable("characterhistory", {
    id: integer("id").notNull().primaryKey({autoIncrement: true}),
    characterId: text("characterId").notNull(),
    userId: text("userId").notNull(),
    updateVersion: integer("updateVersion").notNull(),
    name: text("name").notNull(),
    data: text("data").notNull(),
    savedDate: text("savedDate").notNull(),
    reason: text("reason").notNull()
}, (table) => [
    index("characterhistory_character").on(table.characterId, table.id)
]);

// Saved versions of each character's loadouts, kept like characterhistory. Loadouts carry no
// row version of their own, so version is a per-character counter.
export const loadouthistory = sqliteTable("loadouthistory", {
    id: integer("id").notNull().primaryKey({autoIncrement: true}),
    characterId: text("characterId").notNull(),
    userId: text("userId").notNull(),
    version: integer("version").notNull(),
    loadouts: text("loadouts").notNull(),
    persistent: text("persistent").notNull(),
    savedDate: text("savedDate").notNull(),
    reason: text("reason").notNull()
}, (table) => [
    index("loadouthistory_character").on(table.characterId, table.id)
]);

// Real progression. Only accounts in real mode read or write the tables below:
// every account by default, or with PROGRESSION_MODE=stub only the accounts in
// PROGRESSION_REAL_ACCOUNTS (everyone else keeps the upstream stubs).

// One row per account and track. progress is the total XP; the earned ranks are
// worked out from vendor/progression_config.json exactly like the client does.
export const progresstracks = sqliteTable("progress_tracks", {
    accountId: text("accountId").notNull(),
    progressionId: text("progressionId").notNull(),
    progress: integer("progress").notNull(),
    confirmedFreeRank: integer("confirmedFreeRank").notNull(),
    confirmedPremiumRank: integer("confirmedPremiumRank").notNull(),
    confirmedDate: text("confirmedDate").notNull(),
    updatedDate: text("updatedDate").notNull()
}, (table) => [
    primaryKey({columns: [table.accountId, table.progressionId]})
]);

// Objective state exactly as the game server last sent it
export const objectives = sqliteTable("objectives", {
    accountId: text("accountId").notNull(),
    objectiveId: text("objectiveId").notNull(),
    progress: integer("progress").notNull(),
    completedCount: integer("completedCount").notNull(),
    createdDate: text("createdDate").notNull(),
    lastModifiedDate: text("lastModifiedDate").notNull()
}, (table) => [
    primaryKey({columns: [table.accountId, table.objectiveId]})
]);

// Append-only audit of every real-mode write: the raw request body and our reply
// (triggers in the migration refuse UPDATE and DELETE)
export const progressionevents = sqliteTable("progression_events", {
    id: integer("id").notNull().primaryKey({autoIncrement: true}),
    time: text("time").notNull(),
    accountId: text("accountId").notNull(),
    caller: text("caller").notNull(),
    route: text("route").notNull(),
    body: text("body"),
    status: integer("status").notNull(),
    reply: text("reply"),
    note: text("note")
}, (table) => [
    index("progression_events_account").on(table.accountId, table.id)
]);

export const huntpassselection = sqliteTable("huntpassselection", {
    accountId: text("accountId").notNull().primaryKey(),
    progressionId: text("progressionId").notNull(),
    updatedDate: text("updatedDate").notNull()
});

// duration is in hours, 0 = permanent. A revoked row is kept (revokedDate set) so
// a revoked default entitlement is not handed out again.
export const entitlements = sqliteTable("entitlements", {
    accountId: text("accountId").notNull(),
    name: text("name").notNull(),
    activatedDate: text("activatedDate").notNull(),
    duration: integer("duration").notNull(),
    source: text("source").notNull(),
    grantedDate: text("grantedDate").notNull(),
    revokedDate: text("revokedDate")
}, (table) => [
    primaryKey({columns: [table.accountId, table.name]})
]);

// startedDate is the ISO-8601 string exactly as the game server sent it
export const cooldowns = sqliteTable("cooldowns", {
    accountId: text("accountId").notNull(),
    cooldownId: text("cooldownId").notNull(),
    startedDate: text("startedDate").notNull(),
    updatedDate: text("updatedDate").notNull()
}, (table) => [
    primaryKey({columns: [table.accountId, table.cooldownId]})
]);

// data is the bounty element JSON as the game server sent it
export const bounties = sqliteTable("bounties", {
    accountId: text("accountId").notNull(),
    bountyId: text("bountyId").notNull(),
    slotIndex: integer("slotIndex"),
    updateVersion: integer("updateVersion").notNull(),
    data: text("data").notNull(),
    updatedDate: text("updatedDate").notNull()
}, (table) => [
    primaryKey({columns: [table.accountId, table.bountyId]})
]);

export const bountydraft = sqliteTable("bountydraft", {
    accountId: text("accountId").notNull().primaryKey(),
    data: text("data").notNull(),
    updatedDate: text("updatedDate").notNull()
});

// Unlocked character loadout slots and the active slot. No row = 1 slot, slot 0.
export const loadoutslots = sqliteTable("loadoutslots", {
    characterId: text("characterId").notNull().primaryKey(),
    userId: text("userId").notNull(),
    numCharacterSlots: integer("numCharacterSlots").notNull(),
    activeIndex: integer("activeIndex").notNull(),
    updatedDate: text("updatedDate").notNull()
});

// Friends list (roadmap 1.9, parties plan phase 3). One row per pair of accounts, the two ids
// sorted (userLow < userHigh) so a pair can only exist once. requesterId sent the request;
// status is PENDING until the other side accepts, then ACCEPTED. Times are epoch ms.
export const friendships = sqliteTable("friendships", {
    userLow: text("userLow").notNull(),
    userHigh: text("userHigh").notNull(),
    requesterId: text("requesterId").notNull(),
    status: text("status").notNull(),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull()
}, (table) => [
    primaryKey({columns: [table.userLow, table.userHigh]}),
    index("friendships_high").on(table.userHigh)
]);

// blockerId does not want to hear from blockedId: no friend requests, no party invites
export const blocks = sqliteTable("blocks", {
    blockerId: text("blockerId").notNull(),
    blockedId: text("blockedId").notNull(),
    createdAt: integer("createdAt").notNull()
}, (table) => [
    primaryKey({columns: [table.blockerId, table.blockedId]}),
    index("blocks_blocked").on(table.blockedId)
]);

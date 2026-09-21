import { logger } from "../logger";

// Which accounts get real progression. PROGRESSION_MODE=stub (the default) keeps
// the upstream stubs for everyone: fake max ranks, nothing stored. An account is in
// real mode when PROGRESSION_MODE=real, or when it is listed in
// PROGRESSION_REAL_ACCOUNTS (comma-separated account ids, e.g. UID-...). Real mode
// covers progression and objectives, Hunt Pass, entitlements, loadout slots,
// cooldowns and bounties together; mixing a fake GET with a real grant makes ranks
// jump backwards. Both variables are read from the environment, so a change needs
// a restart.

type ModeSettings = {
    ModeRaw: string | undefined,
    AccountsRaw: string | undefined,
    Global: boolean,
    Accounts: Set<string>
};

let Settings: ModeSettings | undefined;

function GetSettings(){
    const ModeRaw = process.env.PROGRESSION_MODE;
    const AccountsRaw = process.env.PROGRESSION_REAL_ACCOUNTS;

    if(Settings != undefined && Settings.ModeRaw === ModeRaw && Settings.AccountsRaw === AccountsRaw){
        return Settings;
    }

    const Mode = (ModeRaw ?? "").trim().toLowerCase();

    if(Mode !== "" && Mode !== "stub" && Mode !== "real"){
        logger.warn(`PROGRESSION_MODE=${ModeRaw} is not "stub" or "real"; using stub`);
    }

    Settings = {
        ModeRaw: ModeRaw,
        AccountsRaw: AccountsRaw,
        Global: Mode === "real",
        Accounts: new Set((AccountsRaw ?? "").split(",").map((Id) => Id.trim()).filter((Id) => Id.length > 0))
    };

    return Settings;
}

export function IsRealProgressionAccount(AccountId: unknown){
    if(typeof AccountId !== "string" || AccountId.length === 0){
        return false;
    }

    const Current = GetSettings();

    return Current.Global || Current.Accounts.has(AccountId);
}

export function DescribeProgressionMode(){
    const Current = GetSettings();

    return Current.Global ? "real for every account" : `stub, real for ${Current.Accounts.size} listed account(s)`;
}

import { logger } from "./logger";

// The switches added with the port of Harmonic's 1.4.4 fork (github.com/Harmonicrain/Undaunted), read
// in one place. Each has a typed default; a value that does not parse is a warning (once per value) and
// the default. Values are read from the environment at every use, as the older switches are, so a test
// can change one; the boot line (DescribeFeatures) shows what a running server uses. Older switches
// (PROGRESSION_MODE, CHAT, LOG_BODIES, ...) keep their own parsing.
//
// On and off switches take 1, true, on or yes, and 0, false, off or no (any case).

type FeatureSwitch<T> = {
    Env: string,
    Label: string,       // its name in the boot line
    Default: T,
    Parse: (Raw: string) => T | undefined,
    Show: (Value: T) => string
};

const Switches: FeatureSwitch<any>[] = [];
const WarnedValues = new Set<string>();

function ReadSwitch<T>(Switch: FeatureSwitch<T>): T {
    const Raw = process.env[Switch.Env];

    if(Raw === undefined || Raw.trim().length === 0){
        return Switch.Default;
    }

    const Value = Switch.Parse(Raw.trim());

    if(Value === undefined){
        const Key = `${Switch.Env}=${Raw}`;

        if(!WarnedValues.has(Key)){
            WarnedValues.add(Key);
            logger.warn(`${Switch.Env}=${JSON.stringify(Raw)} is not a valid value; using the default (${Switch.Show(Switch.Default)})`);
        }

        return Switch.Default;
    }

    return Value;
}

function DefineSwitch<T>(Switch: FeatureSwitch<T>): () => T {
    Switches.push(Switch);

    return () => ReadSwitch(Switch);
}

export function ParseOnOff(Raw: string): boolean | undefined {
    const Value = Raw.toLowerCase();

    if(["1", "true", "on", "yes"].includes(Value)){
        return true;
    }

    if(["0", "false", "off", "no"].includes(Value)){
        return false;
    }

    return undefined;
}

// A whole number from 0 up
export function ParseCount(Raw: string): number | undefined {
    return /^\d{1,9}$/.test(Raw) ? Number(Raw) : undefined;
}

export function ParseChoice<T extends string>(Choices: readonly T[]): (Raw: string) => T | undefined {
    return (Raw) => Choices.find((Choice) => Choice === Raw.toLowerCase());
}

export const ShowOnOff = (Value: boolean) => Value ? "on" : "off";

// ---- The switches ----

// LOG_BODIES=1 only: at most this many body-log lines per method and path in one run of the metagame
// (a client stuck in a loop once wrote megabytes in minutes). 0, the default, is no cap.
export const BodyLogPerPath = DefineSwitch({
    Env: "BODY_LOG_PER_PATH",
    Label: "bodyLogPerPath",
    Default: 0,
    Parse: ParseCount,
    Show: (Value: number) => Value === 0 ? "no-cap" : String(Value)
});

// Escalation saves (roadmap 2.16; controllers/escalation.ts). stub, the default: every account reads
// upstream's fake maximum and the save route answers 404, as before. real: accounts in real progression
// mode read and save their own seasons; players drop from the fake maximum to level 0 and level up for
// real, so switching it on is the owner's decision after the in-game test.
export const EscalationMode = DefineSwitch({
    Env: "ESCALATION_MODE",
    Label: "escalation",
    Default: "stub" as "stub" | "real",
    Parse: ParseChoice(["stub", "real"] as const),
    Show: (Value: string) => Value
});

// ESCALATION_MODE=real only. The save rules that depend on how the talent tiers, the level costs and
// the reward levels are modelled: off (the default) logs a save that breaks one and stores it anyway;
// on refuses it (409). The rules every save must pass are always enforced.
export const EscalationStrict = DefineSwitch({
    Env: "ESCALATION_STRICT",
    Label: "escalationStrict",
    Default: false,
    Parse: ParseOnOff,
    Show: ShowOnOff
});

// One line for the boot log, e.g. "features: bodyLogPerPath=no-cap"
export function DescribeFeatures(){
    return `features: ${Switches.map((Switch) => `${Switch.Label}=${Switch.Show(ReadSwitch(Switch))}`).join(" ")}`;
}

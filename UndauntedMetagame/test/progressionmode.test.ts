import { RemoveTestDb } from "./setup";
import { after, describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { IsRealProgressionAccount } from "../src/controllers/progressionmode";

const Saved = {Mode: process.env.PROGRESSION_MODE, Accounts: process.env.PROGRESSION_REAL_ACCOUNTS};

function SetEnv(Mode: string | undefined, Accounts: string | undefined){
    if(Mode === undefined){ delete process.env.PROGRESSION_MODE; } else { process.env.PROGRESSION_MODE = Mode; }
    if(Accounts === undefined){ delete process.env.PROGRESSION_REAL_ACCOUNTS; } else { process.env.PROGRESSION_REAL_ACCOUNTS = Accounts; }
}

afterEach(() => SetEnv(Saved.Mode, Saved.Accounts));
after(() => RemoveTestDb(() => {}));

describe("IsRealProgressionAccount", () => {
    it("is stub for everyone by default", () => {
        SetEnv(undefined, undefined);

        assert.equal(IsRealProgressionAccount("UID-a"), false);
    });

    it("is real only for the listed accounts in stub mode", () => {
        SetEnv("stub", " UID-a , UID-b,,");

        assert.equal(IsRealProgressionAccount("UID-a"), true);
        assert.equal(IsRealProgressionAccount("UID-b"), true);
        assert.equal(IsRealProgressionAccount("UID-c"), false);
        assert.equal(IsRealProgressionAccount(""), false);
        assert.equal(IsRealProgressionAccount(undefined), false);
    });

    it("is real for every account with PROGRESSION_MODE=real, but never for a missing id", () => {
        SetEnv("real", undefined);

        assert.equal(IsRealProgressionAccount("UID-anyone"), true);
        assert.equal(IsRealProgressionAccount(undefined), false);
    });

    it("treats an unknown mode as stub", () => {
        SetEnv("yes", undefined);

        assert.equal(IsRealProgressionAccount("UID-a"), false);
    });
});

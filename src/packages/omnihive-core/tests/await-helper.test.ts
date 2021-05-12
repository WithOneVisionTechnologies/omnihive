import { AwaitHelper } from "../helpers/AwaitHelper";
import { assert } from "chai";
import { serializeError } from "serialize-error";

describe("AwaitHelper Tests", async function () {
    const testString = "Successful Test";

    const successFunction = async function (milliseconds: number): Promise<string> {
        return new Promise<string>((resolve) => setTimeout(() => resolve(testString), milliseconds));
    };

    const failFunction = async function (milliseconds: number): Promise<string> {
        return new Promise<string>((_resolve, reject) => setTimeout(() => reject(testString), milliseconds));
    };

    it("standard call", async function () {
        try {
            const result = await AwaitHelper.execute(successFunction(50));
            assert.equal(result, testString);
        } catch (err) {
            throw new Error(JSON.stringify(serializeError(err)));
        }
    });

    it("failure call", async function () {
        try {
            await AwaitHelper.execute(failFunction(50));
            assert.fail("Function should have failed");
        } catch (err) {
            assert.equal(err, testString);
        }
    });
});

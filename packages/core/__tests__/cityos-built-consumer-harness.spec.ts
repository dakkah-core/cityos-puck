/** @jest-environment node */
import { resolve } from "node:path";
import { runBuiltConsumer } from "../__test_support__/run-built-consumer";

const cwd = resolve(__dirname, "..");
const ready = `
  process.once('message', message => {
    if (message.type !== 'run-built-consumer') throw Error('unexpected authority');
    process.disconnect();
    CONSUMER
  });
  process.send({ phase: 'provider-ready' });
`;

describe("built consumer startup and execution deadlines", () => {
  it("allows slow provider startup without spending the consumer deadline", async () => {
    const script = `setTimeout(() => { ${ready.replace("CONSUMER", "console.log('CONSUMER_OK');")} }, 750);`;
    const output = await runBuiltConsumer(script, {
      cwd, providerTimeoutMs: 10_000, consumerTimeoutMs: 500,
    });
    expect(output).toContain("CONSUMER_OK");
  }, 15_000);

  it("kills and joins an owned child that never initializes its provider", async () => {
    await expect(runBuiltConsumer("setInterval(() => {}, 1000);", {
      cwd, providerTimeoutMs: 500, consumerTimeoutMs: 10_000,
    })).rejects.toThrow("provider-startup-timeout");
  }, 15_000);

  it("preserves a separate strict deadline for a hanging actual consumer", async () => {
    await expect(runBuiltConsumer(ready.replace("CONSUMER", "setInterval(() => {}, 1000);"), {
      cwd, providerTimeoutMs: 10_000, consumerTimeoutMs: 300,
    })).rejects.toThrow("consumer-phase-timeout");
  }, 15_000);

  it("rejects an unrecognized provider protocol", async () => {
    await expect(runBuiltConsumer("process.send({ phase: 'not-ready' }); setInterval(() => {}, 1000);", {
      cwd, providerTimeoutMs: 10_000, consumerTimeoutMs: 500,
    })).rejects.toThrow("invalid-provider-handshake");
  }, 15_000);

  it("preserves a failing consumer exit instead of treating provider readiness as success", async () => {
    await expect(runBuiltConsumer(ready.replace("CONSUMER", "process.exit(7);"), {
      cwd, providerTimeoutMs: 10_000, consumerTimeoutMs: 500,
    })).rejects.toThrow("consumer-exit:7");
  }, 15_000);
});

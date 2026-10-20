import { spawn } from "node:child_process";

export function runBuiltConsumer(
  script: string,
  {
    cwd,
    providerTimeoutMs = 30_000,
    consumerTimeoutMs = 20_000,
  }: { cwd: string; providerTimeoutMs?: number; consumerTimeoutMs?: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    let phase: "provider" | "consumer" = "provider";
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    const fail = (error: Error) => {
      failure ??= error;
      if (child.exitCode === null && !child.killed) child.kill();
    };
    let timer = setTimeout(
      () => fail(new Error("built-consumer provider-startup-timeout")),
      providerTimeoutMs
    );
    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 1_048_576) fail(new Error("built-consumer stdout-limit"));
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 1_048_576) fail(new Error("built-consumer stderr-limit"));
    });
    child.on("message", (message: unknown) => {
      if (
        failure ||
        phase !== "provider" ||
        !message ||
        typeof message !== "object" ||
        !("phase" in message) ||
        message.phase !== "provider-ready"
      ) {
        fail(new Error("built-consumer invalid-provider-handshake"));
        return;
      }
      clearTimeout(timer);
      phase = "consumer";
      timer = setTimeout(
        () => fail(new Error("built-consumer consumer-phase-timeout")),
        consumerTimeoutMs
      );
      child.send({ type: "run-built-consumer" }, (error) => {
        if (error) fail(error);
      });
    });
    child.once("error", fail);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failure || code !== 0 || phase !== "consumer") {
        const detail = failure?.message ?? `built-consumer ${phase}-exit:${code}/${signal}`;
        reject(new Error(`${detail}\n${stdout}\n${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

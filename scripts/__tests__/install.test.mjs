import { describe, it, expect } from "vitest";
import { supportedInstallPlatform, buildInstallPlan } from "../install.mjs";

describe("supportedInstallPlatform", () => {
  it("labels macOS as verified and Windows as experimental", () => {
    expect(supportedInstallPlatform("darwin")).toBe("macOS");
    expect(supportedInstallPlatform("win32")).toBe("Windows (experimental)");
    expect(supportedInstallPlatform("linux")).toBeNull();
  });
});

describe("buildInstallPlan", () => {
  it("builds the macOS beginner install command plan", () => {
    const plan = buildInstallPlan({
      platform: "darwin",
      repoAbsPath: "/Users/test/dir with spaces/repo",
      homeDir: "/Users/test",
      env: {},
    });
    expect(plan.platformLabel).toBe("macOS");
    expect(plan.launcherPath).toBe(
      "/Users/test/Library/Application Support/REAPER/Scripts/Streetlight/start_bridge.lua",
    );
    expect(plan.setupOutDir).toBe("/Users/test/dir with spaces/repo/setup-out");
    expect(plan.commands).toEqual([
      ["npm", ["install"]],
      ["npm", ["run", "build"]],
      ["npm", ["run", "setup"]],
    ]);
  });

  it("builds the experimental Windows install command plan", () => {
    const plan = buildInstallPlan({
      platform: "win32",
      repoAbsPath: "C:\\Users\\test\\dir with spaces\\repo",
      homeDir: "C:\\Users\\test",
      env: { APPDATA: "C:\\Users\\test\\AppData\\Roaming" },
    });
    expect(plan.platformLabel).toBe("Windows (experimental)");
    expect(plan.launcherPath).toBe(
      "C:\\Users\\test\\AppData\\Roaming\\REAPER\\Scripts\\Streetlight\\start_bridge.lua",
    );
    expect(plan.setupOutDir).toBe(
      "C:\\Users\\test\\dir with spaces\\repo/setup-out",
    );
  });

  it("rejects unsupported platforms", () => {
    expect(() =>
      buildInstallPlan({
        platform: "linux",
        repoAbsPath: "/home/test/repo",
        homeDir: "/home/test",
        env: {},
      }),
    ).toThrow(/macOS and experimental Windows/);
  });
});

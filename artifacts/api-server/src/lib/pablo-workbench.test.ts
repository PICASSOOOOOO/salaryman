import { describe, expect, it } from "vitest";
import {
  executePabloWorkbenchTool,
  hasAutomationConfirmation,
  hasPublicationConfirmation,
  isExplicitPabloMutationRequest,
  isPabloWorkbenchToolName,
} from "./pablo-workbench";

describe("Pablo workbench actions", () => {
  it("recognizes only declared workbench tools", () => {
    expect(isPabloWorkbenchToolName("pablo_create_my_app")).toBe(true);
    expect(isPabloWorkbenchToolName("pablo_propose_github_change")).toBe(true);
    expect(isPabloWorkbenchToolName("delete_repository_file")).toBe(false);
  });

  it("requires a relevant user request before reading organization data", () => {
    expect(isExplicitPabloMutationRequest("pablo_get_automation_status", "What automation settings are enabled?")).toBe(true);
    expect(isExplicitPabloMutationRequest("pablo_get_automation_status", "What is Pablo Prime?")).toBe(false);
    expect(isExplicitPabloMutationRequest("pablo_list_my_apps", "List my organization pages")).toBe(true);
    expect(isExplicitPabloMutationRequest("pablo_list_github_repositories", "Show my GitHub repos")).toBe(true);
    expect(isExplicitPabloMutationRequest("pablo_read_github_file", "Read package.json in the selected repo")).toBe(true);
  });

  it("requires explicit action language for mutations", () => {
    expect(isExplicitPabloMutationRequest("pablo_update_automation", "How do I enable marketing automation?")).toBe(false);
    expect(isExplicitPabloMutationRequest("pablo_update_automation", "Please turn on marketing automation")).toBe(true);
    expect(isExplicitPabloMutationRequest("pablo_update_automation", "Would you turn on marketing automation?")).toBe(true);
    expect(isExplicitPabloMutationRequest("pablo_create_my_app", "What if you create a page?")).toBe(false);
    expect(isExplicitPabloMutationRequest("pablo_create_my_app", "Create a page for equipment requests")).toBe(true);
    expect(isExplicitPabloMutationRequest("pablo_set_my_app_status", "Publish the Equipment Requests page")).toBe(true);
    expect(isExplicitPabloMutationRequest("pablo_propose_github_change", "Fix the bug in this repository")).toBe(true);
  });

  it("requires confirmation to name the exact automation or page before consequential changes", () => {
    expect(hasAutomationConfirmation("Enable marketing automation", "marketing")).toBe(false);
    expect(hasAutomationConfirmation("Confirm enabling marketing automation", "marketing")).toBe(true);
    expect(hasAutomationConfirmation("Confirm enabling accounting automation", "marketing")).toBe(false);
    expect(hasPublicationConfirmation("Confirm publishing Equipment Requests", "Equipment Requests")).toBe(true);
    expect(hasPublicationConfirmation("Confirm publishing another page", "Equipment Requests")).toBe(false);
  });

  it("does not run organization tools for signed-out users", async () => {
    await expect(executePabloWorkbenchTool({
      userId: null,
      toolName: "pablo_create_my_app",
      arguments: {},
      requestText: "Create a My Apps page",
    })).resolves.toMatchObject({ message: "Sign in to use Pablo's organization tools." });
  });
});

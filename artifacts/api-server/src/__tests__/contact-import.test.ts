import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseContactImportFile } from "../lib/contact-import";

describe("parseContactImportFile", () => {
  it("maps common CSV column names and preserves quoted commas", async () => {
    const csv = [
      "Full Name,Email Address,Mobile,Company Name,Deal Stage,Deal Value,Notes",
      '"Avery Smith",avery@example.com,+1 555 0100,"Acme, Inc.",Proposal,"$2,500","Met at the summit, follow up"',
      ",,,,,,",
    ].join("\n");

    const result = await parseContactImportFile(Buffer.from(csv), "text/csv", "contacts.csv");

    expect(result.hasNameHeader).toBe(true);
    expect(result.headerCount).toBe(7);
    expect(result.rows).toEqual([
      expect.objectContaining({
        name: "Avery Smith",
        email: "avery@example.com",
        phone: "+1 555 0100",
        company: "Acme, Inc.",
        dealStage: "Proposal",
        dealValue: "$2,500",
        bio: "Met at the summit, follow up",
      }),
    ]);
  });

  it("parses the first worksheet of an XLSX file", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Contacts");
    sheet.addRow(["Name", "Phone", "Hometown", "Tag"]);
    sheet.addRow(["Morgan Lee", "+1 555 0200", "Seattle", "Client"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await parseContactImportFile(
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "contacts.xlsx",
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      name: "Morgan Lee",
      phone: "+1 555 0200",
      hometown: "Seattle",
      tag: "Client",
    });
  });

  it("reports files that have no recognized name column", async () => {
    const result = await parseContactImportFile(
      Buffer.from("Company,Phone\nAcme,+1 555 0300"),
      "text/csv",
      "contacts.csv",
    );

    expect(result.headerCount).toBe(2);
    expect(result.hasNameHeader).toBe(false);
    expect(result.rows).toEqual([]);
  });
});

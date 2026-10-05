import ExcelJS from "exceljs";
import { Readable } from "node:stream";

export interface ParsedContactImportRow {
  name: string;
  email: string;
  phone: string;
  address: string;
  age: string;
  ethnicity: string;
  hometown: string;
  timezone: string;
  kids: string;
  bio: string;
  tag: string;
  dealStage: string;
  dealValue: string;
  company: string;
}

export interface ParsedContactImport {
  rows: ParsedContactImportRow[];
  headerCount: number;
  hasNameHeader: boolean;
}

const FIELD_ALIASES: Record<keyof ParsedContactImportRow, string[]> = {
  name: ["name", "full name", "contact name", "lead name"],
  email: ["email", "email address", "e-mail", "mail"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone", "tel"],
  address: ["address", "street", "street address"],
  age: ["age"],
  ethnicity: ["ethnicity"],
  hometown: ["hometown", "city", "home city"],
  timezone: ["timezone", "time zone"],
  kids: ["kids", "children"],
  bio: ["bio", "notes", "note", "description"],
  tag: ["tag", "category"],
  dealStage: ["deal stage", "stage", "pipeline stage"],
  dealValue: ["deal value", "value", "amount"],
  company: ["company", "company name", "business", "business name", "organization", "account"],
};

const normalizeHeader = (value: string): string =>
  value.toLowerCase().replace(/['"]/g, "").replace(/[\s_\-]+/g, "");

export async function parseContactImportFile(
  buffer: Buffer,
  mimetype: string,
  originalName: string,
): Promise<ParsedContactImport> {
  const isSpreadsheet =
    /sheet|excel|xlsx|xlsm/i.test(mimetype) || /\.(xlsx|xlsm)$/i.test(originalName);
  const workbook = new ExcelJS.Workbook();

  if (isSpreadsheet) {
    await workbook.xlsx.load(buffer as any);
  } else {
    const csv = buffer.toString("utf8").replace(/^\uFEFF/, "");
    await workbook.csv.read(Readable.from([csv]));
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], headerCount: 0, hasNameHeader: false };

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, row => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      values[column - 1] = cell.text.trim();
    });
    matrix.push(values);
  });

  if (matrix.length === 0) return { rows: [], headerCount: 0, hasNameHeader: false };
  const headers = (matrix[0] ?? []).map(value => String(value ?? "").trim());
  const normalizedHeaders = headers.map(normalizeHeader);
  const fieldIndexes: Partial<Record<keyof ParsedContactImportRow, number>> = {};

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
    keyof ParsedContactImportRow,
    string[],
  ][]) {
    const normalizedAliases = aliases.map(normalizeHeader);
    const index = normalizedHeaders.findIndex(header => normalizedAliases.includes(header));
    if (index >= 0) fieldIndexes[field] = index;
  }

  const hasNameHeader = fieldIndexes.name !== undefined;
  if (!hasNameHeader) {
    return { rows: [], headerCount: headers.length, hasNameHeader };
  }

  const rows: ParsedContactImportRow[] = [];
  for (const values of matrix.slice(1)) {
    if (values.every(value => !value?.trim())) continue;
    const read = (field: keyof ParsedContactImportRow): string => {
      const index = fieldIndexes[field];
      return index === undefined ? "" : String(values[index] ?? "").trim();
    };

    rows.push({
      name: read("name"),
      email: read("email"),
      phone: read("phone"),
      address: read("address"),
      age: read("age"),
      ethnicity: read("ethnicity"),
      hometown: read("hometown"),
      timezone: read("timezone"),
      kids: read("kids"),
      bio: read("bio"),
      tag: read("tag"),
      dealStage: read("dealStage"),
      dealValue: read("dealValue"),
      company: read("company"),
    });
  }

  return { rows, headerCount: headers.length, hasNameHeader };
}

/**
 * SQL-to-ER Parser
 * Parses CREATE TABLE statements and generates Mermaid ER diagram code.
 */

function parseSqlToMermaid(sql) {
  const tables = parseCreateTables(sql);
  if (tables.length === 0) {
    throw new Error("No CREATE TABLE statements found in the SQL.");
  }
  return generateMermaidER(tables);
}

function parseCreateTables(sql) {
  const tables = [];
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?\w+`?\.)?`?(\w+)`?\s*\(([\s\S]*?)\)\s*;?\s*(?:ENGINE\s*=\s*\w+)?/gi;
  let match;

  while ((match = regex.exec(sql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    tables.push(parseTableBody(tableName, body));
  }

  return tables;
}

function parseTableBody(tableName, body) {
  const columns = [];
  const primaryKeys = [];
  const foreignKeys = [];

  const lines = splitColumns(body);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip table-level constraints
    const priKeyMatch = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (priKeyMatch) {
      const keys = priKeyMatch[1].split(",").map(k => k.trim().replace(/`/g, ""));
      primaryKeys.push(...keys);
      continue;
    }

    const forKeyMatch = trimmed.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:`?\w+`?\.)?`?(\w+)`?\s*\(([^)]+)\)/i);
    if (forKeyMatch) {
      foreignKeys.push({
        column: forKeyMatch[1].replace(/`/g, "").trim(),
        refTable: forKeyMatch[2],
        refColumn: forKeyMatch[3].replace(/`/g, "").trim(),
      });
      continue;
    }

    // Skip indexes, constraints, etc.
    if (/^(INDEX|KEY|UNIQUE|CONSTRAINT|CHECK|FOREIGN|PRIMARY)\b/i.test(trimmed)) {
      continue;
    }

    const col = parseColumnDef(trimmed);
    if (col) {
      columns.push(col);
    }
  }

  // Mark primary keys
  for (const col of columns) {
    if (col.isPrimary || primaryKeys.includes(col.name)) {
      col.isPrimary = true;
    }
  }

  // Mark foreign keys
  for (const fk of foreignKeys) {
    const col = columns.find(c => c.name === fk.column);
    if (col) {
      col.isForeignKey = true;
      col.refTable = fk.refTable;
      col.refColumn = fk.refColumn;
    }
  }

  return { name: tableName, columns, foreignKeys };
}

function splitColumns(body) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseColumnDef(str) {
  // Remove leading/trailing whitespace
  let s = str.trim();

  // Try to match: [name] [type] [constraints...]
  const match = s.match(/^`?(\w+)`?\s+(\w+(?:\s*\([^)]*\))?)\s*(.*)/);
  if (!match) return null;

  const name = match[1];
  let rawType = match[2];
  const constraints = match[3].toUpperCase();

  // Normalize type
  rawType = rawType.replace(/\s*\(.*\)/, "").toUpperCase();

  let sqlType = rawType;
  const TYPE_MAP = {
    "INT": "int",
    "INTEGER": "int",
    "BIGINT": "bigint",
    "SMALLINT": "int",
    "TINYINT": "int",
    "VARCHAR": "string",
    "CHAR": "string",
    "TEXT": "string",
    "LONGTEXT": "string",
    "MEDIUMTEXT": "string",
    "CLOB": "string",
    "BOOLEAN": "boolean",
    "BOOL": "boolean",
    "BIT": "boolean",
    "DATE": "string",
    "DATETIME": "string",
    "TIMESTAMP": "string",
    "TIME": "string",
    "YEAR": "int",
    "FLOAT": "float",
    "DOUBLE": "float",
    "DECIMAL": "float",
    "NUMERIC": "float",
    "REAL": "float",
    "BLOB": "string",
    "LONGBLOB": "string",
    "MEDIUMBLOB": "string",
    "UUID": "string",
    "ENUM": "string",
    "JSON": "string",
    "SERIAL": "bigint",
  };

  const mermaidType = TYPE_MAP[sqlType] || "string";

  const isPrimary = /\bPRIMARY\s+KEY\b/.test(constraints) || /\bAUTO_INCREMENT\b/i.test(s);
  const isForeignKey = /\bFOREIGN\s+KEY\b/.test(constraints);
  const isNotNull = /\bNOT\s+NULL\b/.test(constraints);
  const isUnique = /\bUNIQUE\b/.test(constraints);

  return {
    name,
    type: mermaidType,
    sqlType: rawType,
    isPrimary,
    isForeignKey,
    isNotNull,
    isUnique,
  };
}

function generateMermaidER(tables) {
  let mermaid = "erDiagram\n";

  // Entity definitions
  for (const table of tables) {
    mermaid += `    ${table.name} {\n`;
    for (const col of table.columns) {
      let suffix = "";
      if (col.isPrimary && col.isForeignKey) suffix = " PK, FK";
      else if (col.isPrimary) suffix = " PK";
      else if (col.isForeignKey) suffix = " FK";
      else if (col.isUnique) suffix = " UK";

      mermaid += `        ${col.type} ${col.name}${suffix}\n`;
    }
    mermaid += `    }\n`;
  }

  mermaid += "\n";

  // Relationships
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isForeignKey && col.refTable) {
        const relTable = tables.find(t => t.name.toUpperCase() === col.refTable.toUpperCase());
        const refName = relTable ? relTable.name : col.refTable;
        mermaid += `    ${refName} ||--o{ ${table.name} : "has"\n`;
      }
    }

    // Detect relationships from foreign keys defined at table level
    for (const fk of table.foreignKeys) {
      const relTable = tables.find(t => t.name.toUpperCase() === fk.refTable.toUpperCase());
      const refName = relTable ? relTable.name : fk.refTable;
      mermaid += `    ${refName} ||--o{ ${table.name} : "has"\n`;
    }
  }

  return mermaid;
}

// Export for both browser and Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseSqlToMermaid, parseCreateTables };
}

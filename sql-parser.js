/**
 * SQL-to-ER Parser
 * Parses CREATE TABLE + ALTER TABLE statements and generates Mermaid ER diagram code.
 */

function parseSqlToMermaid(sql) {
  const tables = parseCreateTables(sql);
  if (tables.length === 0) {
    throw new Error("No CREATE TABLE statements found in the SQL.");
  }
  parseAlterTableStatements(sql, tables);
  inferForeignKeys(tables);
  return generateMermaidER(tables);
}

// --- CREATE TABLE parsing ---

function parseCreateTables(sql) {
  const tables = [];
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?\w+`?\.)?`?(\w+)`?\s*\(/gi;
  let match;

  while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const startIdx = match.index + match[0].length;
    const body = extractBalancedParens(sql, startIdx);
    if (body === null) continue;

    tables.push(parseTableBody(tableName, body));
  }

  return tables;
}

function extractBalancedParens(sql, startIdx) {
  let depth = 1;
  let i = startIdx;
  while (depth > 0 && i < sql.length) {
    const ch = sql[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return sql.substring(startIdx, i - 1);
}

function parseTableBody(tableName, body) {
  const columns = [];
  const primaryKeys = [];
  const foreignKeys = [];

  const lines = splitColumns(body);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const priKeyMatch = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (priKeyMatch) {
      const keys = priKeyMatch[1].split(",").map(k => k.trim().replace(/`/g, ""));
      primaryKeys.push(...keys);
      continue;
    }

    const forKeyMatch = trimmed.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:`?\w+`?\.)?`?(\w+)`?\s*\(([^)]+)\)/i);
    if (forKeyMatch) {
      const col = forKeyMatch[1].replace(/`/g, "").trim();
      foreignKeys.push({
        column: col,
        refTable: forKeyMatch[2],
        refColumn: forKeyMatch[3].replace(/`/g, "").trim(),
      });
      continue;
    }

    if (/^(INDEX|KEY|UNIQUE|CONSTRAINT|CHECK|FOREIGN|PRIMARY|FULLTEXT|SPATIAL)\b/i.test(trimmed)) {
      continue;
    }

    const col = parseColumnDef(trimmed);
    if (col) {
      columns.push(col);
    }
  }

  for (const col of columns) {
    if (col.isPrimary || primaryKeys.includes(col.name)) {
      col.isPrimary = true;
    }
  }

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
    if (ch === "'" || ch === '"') {
      current += ch;
      continue;
    }
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
  const match = str.match(/^`?(\w+)`?\s+(\w+(?:\s*\([^)]*\))?)\s*(.*)/);
  if (!match) return null;

  const name = match[1];
  let rawType = match[2];
  const constraints = match[3].toUpperCase();

  rawType = rawType.replace(/\s*\(.*\)/, "").toUpperCase();

  const TYPE_MAP = {
    INT: "int", INTEGER: "int", BIGINT: "bigint", SMALLINT: "int",
    TINYINT: "int", MEDIUMINT: "int",
    VARCHAR: "string", CHAR: "string", TEXT: "string", LONGTEXT: "string",
    MEDIUMTEXT: "string", TINYTEXT: "string", CLOB: "string",
    BOOLEAN: "boolean", BOOL: "boolean", BIT: "boolean",
    DATE: "string", DATETIME: "string", TIMESTAMP: "string",
    TIME: "string", YEAR: "int",
    FLOAT: "float", DOUBLE: "float", DECIMAL: "float",
    NUMERIC: "float", REAL: "float",
    BLOB: "string", LONGBLOB: "string", MEDIUMBLOB: "string", TINYBLOB: "string",
    UUID: "string", ENUM: "string", SET: "string", JSON: "string", SERIAL: "bigint",
  };

  const mermaidType = TYPE_MAP[rawType] || "string";
  const isPrimary = /\bPRIMARY\s+KEY\b/.test(constraints) || /\bAUTO_INCREMENT\b/i.test(str);
  const isUnique = /\bUNIQUE\b/.test(constraints);
  const s = str.trim();

  return {
    name, type: mermaidType, sqlType: rawType,
    isPrimary, isForeignKey: false, isNotNull: /\bNOT\s+NULL\b/.test(constraints),
    isUnique, refTable: null, refColumn: null,
  };
}

// --- ALTER TABLE parsing ---

function parseAlterTableStatements(sql, tables) {
  const tableMap = {};
  for (const t of tables) {
    tableMap[t.name.toUpperCase()] = t;
  }

  // ALTER TABLE ... ADD PRIMARY KEY (...)
  const pkRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?`?(\w+)`?\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/gi;
  let pkMatch;
  while ((pkMatch = pkRegex.exec(sql)) !== null) {
    const tbl = tableMap[pkMatch[1].toUpperCase()];
    if (!tbl) continue;
    const keys = pkMatch[2].split(",").map(k => k.trim().replace(/`/g, ""));
    for (const col of tbl.columns) {
      if (keys.includes(col.name)) col.isPrimary = true;
    }
  }

  // ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES ...
  const fkRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:IF\s+EXISTS\s+)?`?(\w+)`?\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:`?\w+`?\.)?`?(\w+)`?\s*\(([^)]+)\)/gi;
  let fkMatch;
  while ((fkMatch = fkRegex.exec(sql)) !== null) {
    const tbl = tableMap[fkMatch[1].toUpperCase()];
    if (!tbl) continue;
    const colName = fkMatch[2].replace(/`/g, "").trim();
    const refTable = fkMatch[3];
    const refCol = fkMatch[4].replace(/`/g, "").trim();
    const col = tbl.columns.find(c => c.name === colName);
    if (col) {
      col.isForeignKey = true;
      col.refTable = refTable;
      col.refColumn = refCol;
    }
  }
}

// --- Heuristic FK detection by naming convention ---

function inferForeignKeys(tables) {
  const singularMap = {};
  for (const t of tables) {
    singularMap[t.name.toUpperCase()] = t.name;
  }

  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isForeignKey) continue;

      const name = col.name.toUpperCase();
      const tName = table.name;

      // pattern: xxx_id (suffix)
      const suffixMatch = name.match(/^(.+)_ID$/);
      if (suffixMatch) {
        const ref = suffixMatch[1];
        if (tryMatchForeignKey(col, ref, singularMap, "id", tName)) continue;
      }

      // pattern: idXxx (prefix, e.g. idDepartement, idProgramme)
      const prefixMatch = name.match(/^ID(.+)/);
      if (prefixMatch) {
        const ref = prefixMatch[1];
        if (tryMatchForeignKey(col, ref, singularMap, "id", tName)) continue;
      }

      // pattern: xxx_code
      const codeMatch = name.match(/^(.+)_CODE$/);
      if (codeMatch) {
        const ref = codeMatch[1];
        tryMatchForeignKey(col, ref, singularMap, "code", tName);
      }
    }
  }
}

function tryMatchForeignKey(col, refName, singularMap, refColumn, currentTableName) {
  const ref = refName.toUpperCase();
  for (const [key, val] of Object.entries(singularMap)) {
    if (key === ref || key.replace(/s$/, '') === ref || key === ref.replace(/s$/, '')) {
      // Skip self-references that are just PK matching own table name
      if (currentTableName && currentTableName.toUpperCase() === key && col.isPrimary) {
        continue;
      }
      if (currentTableName && currentTableName.toUpperCase() === key && val === refName) {
        continue;
      }
      col.isForeignKey = true;
      col.refTable = val;
      col.refColumn = refColumn;
      return true;
    }
  }
  return false;
}

// --- Mermaid generation ---

function generateMermaidER(tables) {
  let mermaid = "erDiagram\n";

  for (const table of tables) {
    if (table.columns.length === 0) continue;
    mermaid += `    ${table.name} {\n`;
    for (const col of table.columns) {
      let suffix = "";
      if (col.isPrimary && col.isForeignKey) suffix = " PK, FK";
      else if (col.isPrimary) suffix = " PK";
      else if (col.isForeignKey) suffix = " FK";
      else if (col.isUnique) suffix = " UK";
      const type = col.type || "string";
      mermaid += `        ${type} ${col.name}${suffix}\n`;
    }
    mermaid += "    }\n";
  }

  mermaid += "\n";

  const used = new Set();
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isForeignKey && col.refTable) {
        const key = `${table.name}->${col.refTable}`;
        if (used.has(key)) continue;
        used.add(key);
        const label = generateRelationLabel(col.refTable, table.name, col.name);
        mermaid += `    ${col.refTable} ||--o{ ${table.name} : "${label}"\n`;
      }
    }
  }

  return mermaid;
}

function generateRelationLabel(parentTable, childTable, fkColName) {
  var role = fkColName.replace(/_(?:id|code|key)$/i, '').toLowerCase();
  var parent = parentTable.toLowerCase();
  var child = childTable.toLowerCase();

  var verbMap = {
    teacher: "teaches",
    student: "enrols",
    manager: "manages",
    owner: "owns",
    author: "authors",
    creator: "creates",
    sender: "sends",
    receiver: "receives",
    editor: "edits",
    reviewer: "reviews",
    buyer: "buys",
    seller: "sells",
    member: "includes",
    lead: "leads",
    coordinator: "coordinates",
    supervisor: "supervises",
    assistant: "assists",
    category: "categorises",
    publisher: "publishes",
    parent: "contains",
  };

  if (verbMap[role]) return verbMap[role];

  if (role === parent || role + "s" === parent || role === parent.replace(/s$/, "")) {
    var parentVerb = {
      course: "contains",
      user: "has",
      room: "houses",
      quiz: "includes",
      assignment: "receives",
      student: "enrols",
      teacher: "teaches",
    };
    if (parentVerb[parent]) return parentVerb[parent];
  }

  return "has";
}

// --- Mermaid code enhancement: auto-detect relationships from naming ---

function enhanceMermaidWithRelations(mermaidCode) {
  const tables = parseMermaidEntities(mermaidCode);
  if (tables.length === 0) return mermaidCode;

  // Apply heuristic FK detection
  inferForeignKeys(tables);

  const existingRelations = new Set();
  const relRegex = /^(\s*)(\w+)\s*[\|o\{]+\-+[\|o\{]+\s*(\w+)\s*:/gm;
  let relMatch;
  while ((relMatch = relRegex.exec(mermaidCode)) !== null) {
    const from = relMatch[2].toUpperCase();
    const to = relMatch[3].toUpperCase();
    existingRelations.add(`${from}->${to}`);
    existingRelations.add(`${to}->${from}`);
  }

  const used = new Set();
  for (const key of existingRelations) used.add(key);

  let extra = "\n";
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isForeignKey && col.refTable) {
        const key = `${table.name.toUpperCase()}->${col.refTable.toUpperCase()}`;
        const revKey = `${col.refTable.toUpperCase()}->${table.name.toUpperCase()}`;
        if (used.has(key) || used.has(revKey)) continue;
        used.add(key);
        used.add(revKey);
        extra += `    ${col.refTable} ||--o{ ${table.name} : "has"\n`;
      }
    }
  }

  if (extra === "\n") return mermaidCode;
  return mermaidCode + extra;
}

function parseMermaidEntities(mermaidCode) {
  const tables = [];
  const entityRegex = /^\s*(\w+)\s*\{([^}]+)\}/gm;
  let match;

  while ((match = entityRegex.exec(mermaidCode)) !== null) {
    const name = match[1];
    const body = match[2];
    const columns = [];

    const lines = body.trim().split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;

      const type = parts[0];
      const colName = parts[1];
      const rest = parts.slice(2).join(" ").toUpperCase();

      const isPrimary = rest.includes("PK");
      const isForeignKey = rest.includes("FK");

      columns.push({
        name: colName,
        type,
        isPrimary,
        isForeignKey,
        isUnique: rest.includes("UK"),
        refTable: null,
        refColumn: null,
      });
    }

    tables.push({ name, columns });
  }

  return tables;
}

// --- Exports ---

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseSqlToMermaid, parseCreateTables, enhanceMermaidWithRelations };
}

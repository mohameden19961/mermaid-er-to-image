function parseJsonSchemaToMermaid(jsonData) {
  let tables = jsonData;
  if (!Array.isArray(tables)) {
    if (Array.isArray(jsonData.tables)) {
      tables = jsonData.tables;
    } else {
      throw new Error("Invalid JSON: expected an array of tables or an object with a 'tables' array.");
    }
  }

  if (tables.length === 0) {
    throw new Error("No tables found in JSON schema.");
  }

  const parsed = [];
  for (const t of tables) {
    if (!t.name || !Array.isArray(t.columns)) continue;
    const columns = [];
    for (const c of t.columns) {
      columns.push({
        name: c.name,
        type: mapJsonType(c.type),
        isPrimary: !!c.primaryKey || !!c.pk,
        isForeignKey: !!c.foreignKey,
        isUnique: !!c.unique,
        isNotNull: !!c.notNull || !!c.required,
        refTable: c.foreignKey ? c.foreignKey.table || c.foreignKey.refTable || c.foreignKey.ref : null,
        refColumn: c.foreignKey ? c.foreignKey.column || c.foreignKey.refColumn || 'id' : null,
      });
    }
    parsed.push({ name: t.name, columns });
  }

  if (parsed.length === 0) {
    throw new Error("No valid table definitions found in JSON.");
  }

  let mermaid = "erDiagram\n";

  for (const table of parsed) {
    if (table.columns.length === 0) continue;
    mermaid += "    " + table.name + " {\n";
    for (const col of table.columns) {
      let suffix = "";
      if (col.isPrimary && col.isForeignKey) suffix = " PK, FK";
      else if (col.isPrimary) suffix = " PK";
      else if (col.isForeignKey) suffix = " FK";
      else if (col.isUnique) suffix = " UK";
      mermaid += "        " + col.type + " " + col.name + suffix + "\n";
    }
    mermaid += "    }\n";
  }

  mermaid += "\n";

  const used = new Set();

  for (const table of parsed) {
    for (const col of table.columns) {
      if (col.isForeignKey && col.refTable) {
        const key = table.name + "->" + col.refTable;
        if (used.has(key)) continue;
        used.add(key);
        mermaid += "    " + col.refTable + " ||--o{ " + table.name + ' : "has"\n';
      }
    }
  }

  if (Array.isArray(jsonData.relationships)) {
    for (const rel of jsonData.relationships) {
      const key = rel.to + "->" + rel.from;
      const revKey = rel.from + "->" + rel.to;
      if (used.has(key) || used.has(revKey)) continue;
      used.add(key);
      used.add(revKey);
      const arrow = rel.type === "one-to-one" ? "||--||"
        : rel.type === "one-to-many-mandatory" ? "||--|{"
        : "||--o{";
      mermaid += "    " + rel.from + " " + arrow + " " + rel.to + ' : "' + (rel.label || "") + '"\n';
    }
  }

  return mermaid;
}

function mapJsonType(type) {
  if (!type) return "string";
  var t = String(type).toLowerCase();
  var map = {
    int: "int", integer: "int", bigint: "bigint", smallint: "int",
    tinyint: "int", mediumint: "int", serial: "bigint",
    string: "string", varchar: "string", char: "string", text: "string", longtext: "string",
    boolean: "boolean", bool: "boolean", bit: "boolean",
    float: "float", double: "float", decimal: "float", numeric: "float", real: "float",
    date: "string", datetime: "string", timestamp: "string", time: "string",
    year: "int", blob: "string", uuid: "string", enum: "string", json: "string",
    number: "int",
  };
  return map[t] || "string";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseJsonSchemaToMermaid };
}

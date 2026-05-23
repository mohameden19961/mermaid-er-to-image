function parseJsonSchemaToMermaid(jsonData) {
  if (isPhpMyAdminFormat(jsonData)) {
    return parsePhpMyAdminJson(jsonData);
  }

  var tables = jsonData;
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

  var parsed = [];
  for (var ti = 0; ti < tables.length; ti++) {
    var t = tables[ti];
    if (!t.name || !Array.isArray(t.columns)) continue;
    var columns = [];
    for (var ci = 0; ci < t.columns.length; ci++) {
      var c = t.columns[ci];
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
    parsed.push({ name: t.name, columns: columns });
  }

  if (parsed.length === 0) {
    throw new Error("No valid table definitions found in JSON.");
  }

  var mermaid = buildMermaidER(parsed, jsonData.relationships);
  return mermaid;
}

function isPhpMyAdminFormat(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data[0] && data[0].type === "header";
}

function parsePhpMyAdminJson(data) {
  var tables = [];
  var dbName = "";

  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    if (item.type === "database") {
      dbName = item.name || "";
    }
    if (item.type === "table" && Array.isArray(item.data)) {
      var tableName = item.name || "unknown";
      var rows = item.data;
      var colNames = [];
      var colTypes = {};

      if (rows.length > 0) {
        var sample = rows[0];
        colNames = Object.keys(sample);

        for (var ci = 0; ci < colNames.length; ci++) {
          var cname = colNames[ci];
          var type = inferTypeFromValues(rows, cname);
          colTypes[cname] = type;
        }
      }

      var columns = [];
      for (var ci2 = 0; ci2 < colNames.length; ci2++) {
        var cname2 = colNames[ci2];
        var isPk = (cname2 === "id");
        var col = {
          name: cname2,
          type: colTypes[cname2] || "string",
          isPrimary: isPk,
          isForeignKey: false,
          isUnique: false,
          isNotNull: false,
          refTable: null,
          refColumn: null,
        };
        columns.push(col);
      }

      tables.push({ name: tableName, columns: columns, _rows: rows.length });
    }
  }

  if (tables.length === 0) {
    throw new Error("No tables found in the PHPMyAdmin JSON export.");
  }

  // Auto-detect PK for tables without an 'id' column
  for (var ti = 0; ti < tables.length; ti++) {
    var table = tables[ti];
    var hasPk = false;
    for (var ci3 = 0; ci3 < table.columns.length; ci3++) {
      if (table.columns[ci3].isPrimary) { hasPk = true; break; }
    }
    if (!hasPk && table.columns.length > 0) {
      // Try to find a column ending with '_id' or just use first column
      var pkCol = null;
      for (var ci4 = 0; ci4 < table.columns.length; ci4++) {
        if (/[_.]?id$/i.test(table.columns[ci4].name)) { pkCol = table.columns[ci4]; break; }
      }
      if (pkCol) pkCol.isPrimary = true;
    }
  }

  // Use inferForeignKeys from sql-parser.js if available (global)
  if (typeof inferForeignKeys === "function") {
    inferForeignKeys(tables);
  }

  var relationships = null;
  if (typeof inferForeignKeys === "function") {
    relationships = [];
  }

  return buildMermaidER(tables, relationships);
}

function inferTypeFromValues(rows, colName) {
  var numberCount = 0;
  var total = Math.min(rows.length, 20);
  if (total === 0) return "string";

  for (var i = 0; i < total; i++) {
    var val = rows[i][colName];
    if (val === null || val === undefined) continue;
    if (typeof val === "number") { numberCount++; continue; }
    if (typeof val === "boolean") return "boolean";
    var s = String(val);
    if (s === "0" || s === "1") { numberCount++; continue; }
    if (/^-?\d+$/.test(s)) { numberCount++; continue; }
    if (/^-?\d+\.\d+$/.test(s)) return "float";
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return "string";
    return "string";
  }

  if (numberCount === total) {
    // Check if values are small => int, otherwise bigint
    return "int";
  }
  return "string";
}

function buildMermaidER(parsed, relationships) {
  var mermaid = "erDiagram\n";

  for (var ti = 0; ti < parsed.length; ti++) {
    var table = parsed[ti];
    if (table.columns.length === 0) continue;
    mermaid += "    " + table.name + " {\n";
    for (var ci = 0; ci < table.columns.length; ci++) {
      var col = table.columns[ci];
      var suffix = "";
      if (col.isPrimary && col.isForeignKey) suffix = " PK, FK";
      else if (col.isPrimary) suffix = " PK";
      else if (col.isForeignKey) suffix = " FK";
      else if (col.isUnique) suffix = " UK";
      mermaid += "        " + col.type + " " + col.name + suffix + "\n";
    }
    mermaid += "    }\n";
  }

  mermaid += "\n";

  var used = {};

  for (var ti2 = 0; ti2 < parsed.length; ti2++) {
    var table2 = parsed[ti2];
    for (var ci2 = 0; ci2 < table2.columns.length; ci2++) {
      var col2 = table2.columns[ci2];
      if (col2.isForeignKey && col2.refTable) {
        var key = table2.name + "->" + col2.refTable;
        if (used[key]) continue;
        used[key] = true;
        mermaid += "    " + col2.refTable + " ||--o{ " + table2.name + ' : "has"\n';
      }
    }
  }

  if (Array.isArray(relationships)) {
    for (var ri = 0; ri < relationships.length; ri++) {
      var rel = relationships[ri];
      var key2 = rel.to + "->" + rel.from;
      var revKey = rel.from + "->" + rel.to;
      if (used[key2] || used[revKey]) continue;
      used[key2] = true;
      used[revKey] = true;
      var arrow = rel.type === "one-to-one" ? "||--||"
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
  module.exports = { parseJsonSchemaToMermaid, parsePhpMyAdminJson };
}

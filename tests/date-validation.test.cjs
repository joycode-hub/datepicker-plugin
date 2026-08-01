const assert = require("node:assert/strict");
const fs = require("node:fs");
const typescript = require("typescript");

require.extensions[".ts"] = (module, filename) => {
	const source = fs.readFileSync(filename, "utf8");
	const output = typescript.transpileModule(source, {
		compilerOptions: {
			module: typescript.ModuleKind.CommonJS,
			target: typescript.ScriptTarget.ES2018,
		},
	}).outputText;
	module._compile(output, filename);
};

const { isValidDateMatch } = require("../date-validation.ts");

const dotDateFormats = ["DD.MM.YYYY", "MM.DD.YYYY", "YYYY.MM.DD"];
const versionCandidate = /\d{1,4}\.\d{1,2}\.\d{1,4}/.exec("Version 1.3.0")[0];

for (const format of dotDateFormats) {
	assert.equal(isValidDateMatch("1.3.0", format), false, `1.3.0 must not match ${format}`);
}
assert.equal(dotDateFormats.some((format) => isValidDateMatch(versionCandidate, format)), false);

assert.equal(isValidDateMatch("2024.02.30", "YYYY.MM.DD"), false);
assert.equal(isValidDateMatch("2023.02.29", "YYYY.MM.DD"), false);
assert.equal(isValidDateMatch("2024.02.29", "YYYY.MM.DD"), true);
assert.equal(isValidDateMatch("1.3.2024", "DD.MM.YYYY"), true);
assert.equal(isValidDateMatch("2024.3.1", "YYYY.MM.DD"), true);
assert.equal(isValidDateMatch("23:99", "HH:mm"), false);
assert.equal(isValidDateMatch("9:05", "HH:mm"), true);
assert.equal(isValidDateMatch("2024-03-01 23:59", "YYYY-MM-DD HH:mm"), true);
assert.equal(isValidDateMatch("2024-03-01 24:00", "YYYY-MM-DD HH:mm"), false);
assert.equal(
	isValidDateMatch("2024-03-01", "YYYY-MM-DD", "2024-03-01 24:00", 0),
	false,
	"the valid date prefix of an invalid datetime must not be detected separately",
);
assert.equal(isValidDateMatch("2024-03-01", "YYYY-MM-DD", "Release 2024-03-01", 8), true);

console.log("date validation tests passed");

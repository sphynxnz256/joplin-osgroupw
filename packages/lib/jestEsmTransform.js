// Kysely is published as ES modules only; this converts it to CommonJS for Jest.
const ts = require('typescript');

module.exports = {
	process(sourceText, sourcePath) {
		const result = ts.transpileModule(sourceText, {
			fileName: sourcePath,
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, allowJs: true },
		});
		return { code: result.outputText };
	},
};

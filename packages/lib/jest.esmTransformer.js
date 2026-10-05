// Kysely is published as ESM only, while the lib tests run as CommonJS, so
// its files are converted to CommonJS when loaded by Jest.
const ts = require('typescript');

module.exports = {
	process(sourceText, sourcePath) {
		const output = ts.transpileModule(sourceText, {
			fileName: sourcePath,
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, allowJs: true },
		});
		return { code: output.outputText };
	},
};

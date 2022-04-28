import path from "path";
import fse from "fs-extra";
import glob from "fast-glob";
import * as babel from "@babel/core";
// @ts-expect-error these modules dont have types
import babelPluginSyntaxJSX from "@babel/plugin-syntax-jsx";
// @ts-expect-error these modules dont have types
import babelPresetTypeScript from "@babel/preset-typescript";
import prettier from "prettier";
import JSON5 from "json5";
import type { TsConfigJson } from "type-fest";

function convertToJavaScript(
  filename: string,
  source: string,
  projectDir: string
): string {
  let result = babel.transformSync(source, {
    filename,
    presets: [[babelPresetTypeScript, { jsx: "preserve" }]],
    plugins: [babelPluginSyntaxJSX],
    compact: false,
    retainLines: true,
    cwd: projectDir,
  });

  if (!result || !result.code) {
    throw new Error("Could not parse typescript");
  }

  /*
    Babel's `compact` and `retainLines` options are both bad at formatting code.
    Use Prettier for nicer formatting.
  */
  return prettier.format(result.code, { parser: "babel" });
}

export async function convertTemplateToJavaScript(projectDir: string) {
  // 1. Convert all .ts files in the template to .js
  let entries = glob.sync("**/*.+(ts|tsx)", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });
  for (let entry of entries) {
    if (entry.endsWith(".d.ts")) {
      fse.removeSync(entry);
      continue;
    }

    let contents = fse.readFileSync(entry, "utf8");
    let filename = path.basename(entry);
    let javascript = convertToJavaScript(filename, contents, projectDir);

    fse.writeFileSync(entry, javascript, "utf8");
    if (entry.endsWith(".tsx")) {
      fse.renameSync(entry, entry.replace(/\.tsx?$/, ".jsx"));
    } else {
      fse.renameSync(entry, entry.replace(/\.ts?$/, ".js"));
    }
  }

  // 2. Rename all tsconfig.json files to jsconfig.json
  let tsconfigs = glob.sync("**/tsconfig.json", {
    cwd: projectDir,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });
  for (let tsconfig of tsconfigs) {
    let contents = fse.readFileSync(tsconfig, "utf8");
    let json = JSON5.parse(contents) as TsConfigJson;
    if (json.include) {
      json.include = json.include
        .map((include) => {
          if (include === "remix.env.d.ts") return null;
          if (include === "**/*.ts") return "**/*.js";
          if (include === "**/*.tsx") return "**/*.jsx";
          return include;
        })
        .filter((include: any): include is string => include !== null);
    }

    fse.writeFileSync(
      tsconfig,
      prettier.format(JSON.stringify(json, null, 2), {
        parser: "json",
      }),
      "utf8"
    );

    let dir = path.dirname(tsconfig);
    fse.renameSync(tsconfig, path.join(dir, "jsconfig.json"));
  }

  // 3. Remove @types/* and typescript from package.json
  let packageJsonPath = path.join(projectDir, "package.json");
  if (!fse.existsSync(packageJsonPath)) {
    throw new Error("Could not find package.json");
  }
  let pkg = JSON.parse(fse.readFileSync(packageJsonPath, "utf8"));
  let devDeps = pkg.devDependencies || {};
  devDeps = Object.fromEntries(
    Object.entries(devDeps).filter(([name]) => {
      return !name.startsWith("@types/") && name !== "typescript";
    })
  );
  pkg.devDependencies = devDeps;
  fse.writeJSONSync(packageJsonPath, pkg, {
    spaces: 2,
  });
}

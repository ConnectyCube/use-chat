// https://blog.logrocket.com/how-to-build-component-library-react-typescript/

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";
import terser from "@rollup/plugin-terser";
import peerDepsExternal from "rollup-plugin-peer-deps-external";

const packageJson = require("./package.json");

const globals = {
  "@xmpp/client-core": "_Client",
  "@xmpp/jid": "_jid",
  "@xmpp/xml": "_xml",
  "@xmpp/resolve": "_resolve",
  "@xmpp/session-establishment": "_sessionEstablishment",
};

export default [
  {
    input: "src/index.ts",
    output: [
      {
        file: packageJson.main,
        format: "cjs",
        sourcemap: true,
      },
      {
        file: packageJson.module,
        format: "esm",
        sourcemap: true,
      },
    ],
    plugins: [
      peerDepsExternal(),
      resolve(),
      commonjs(),
      typescript({ tsconfig: "./tsconfig.json" }),
      terser(),
    ],
    external: ["react", "react-dom", ...Object.keys(globals)],
  },
  // {
  //   input: "src/index.ts",
  //   output: [{ file: "dist/types.d.ts", format: "es" }],
  //   plugins: [dts.default()],
  // },
];

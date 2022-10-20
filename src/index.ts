import mdx from '@mdx-js/mdx'
import { build, transformSync } from 'esbuild'
import * as React from 'react'
import { renderToString } from 'react-dom/server'
import requireFromString from 'require-from-string'

const ROOT_ID = 'MDX_ROOT'

const esBuildMDXPlugin = ({ content }) => ({
  name: 'esbuild-mdx',
  setup(build) {
    build.onLoad({ filter: /\.mdx?$/ }, async () => {
      return {
        contents: `
        import React from "react";
        import { mdx } from "@mdx-js/react";
        ${await mdx(content)}
        `,
        loader: 'jsx'
      }
    })
  }
})

const doEsBuild = async (options) => {
  const { outputFiles } = await build(options)
  return new TextDecoder('utf-8').decode(outputFiles[0].contents)
}

const mdxBuildPlugin = (eleventyConfig) => {
  process.env.ELEVENTY_EXPERIMENTAL = 'true'
  eleventyConfig.addTemplateFormats('mdx')
  eleventyConfig.addExtension('mdx', {
    getData: true,
    getInstanceFromInputPath: () => Promise.resolve({}),
    init: () => {},
    compile: (content, inputPath) => async (props) => {
      const esbuildOptions = {
        minify: false,
        external: ['react', 'react-dom'],
        write: false,
        plugins: [esBuildMDXPlugin({ content })],
        metafile: true,
        bundle: true,
        entryPoints: [inputPath]
      }

      const defaultExport = requireFromString(
        await doEsBuild({
          platform: 'node',
          ...esbuildOptions
        })
      )

      delete props.collections

      let hydrateScript = transformSync(
        `
        ${await doEsBuild({
          platform: 'browser',
          globalName: 'Component',
          ...esbuildOptions
        })};
        const container = document.querySelector('#${ROOT_ID}');
        const props = JSON.parse(JSON.stringify(${JSON.stringify(props)}));
        const app = React.createElement(Component.default, props, null)
        ReactDOM.hydrateRoot(container, app);
        `,
        {
          format: 'iife',
          minify: false
        }
      ).code

      const rootComponent = React.createElement(
        'div',
        { id: ROOT_ID },
        React.createElement(defaultExport.default, props, null)
      )

      return `
        <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
        ${renderToString(rootComponent)}
        <script>
        const require = (e) => { if (e === "react") return window.React; };
        ${hydrateScript}
        </script>
        `
    }
  })
}

module.exports = mdxBuildPlugin

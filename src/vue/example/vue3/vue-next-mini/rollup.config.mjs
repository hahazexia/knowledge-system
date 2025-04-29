import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default [
  {
     input: 'packages/vue/src/index.ts', // 入口文件
     output: [
      {
        sourcemap: true, // 开启 sourcemap
        file: './packages/vue/dist/vue.js', // 导出文件地址
        format: 'iife', // 出口文件 导出一个 iife 格式的包
        name: 'Vue', // 变量名
      }
     ],
     plugins: [
      typescript({ // ts
        sourceMap: true,
      }),
      resolve(), // 模块导入路径补全
      commonjs(), // 转换 commonjs 为 esm
     ]
  }
];
import type {Configuration} from 'webpack';
export const mainConfig = {entry:'./src/main/index.ts',module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:{loader:'ts-loader',options:{transpileOnly:true}}}]},resolve:{extensions:['.ts','.tsx','.js']}} satisfies Configuration;

export default mainConfig;

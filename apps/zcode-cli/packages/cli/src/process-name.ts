declare const __CLI_PRODUCT_NAME__: string | undefined;

// HZCode 等公司自有打包形态通过构建期 esbuild define 注入产品名（specs/hzcode-packaging/spec.md）。
// 未注入时（tsx dev、桌面 agent 旧链路）回退 zcode，保证存量构建产物与进程名零迁移。
const productName =
  typeof __CLI_PRODUCT_NAME__ === "string" && __CLI_PRODUCT_NAME__.trim()
    ? __CLI_PRODUCT_NAME__.trim()
    : "zcode";

export const CLI_COMMAND_NAME = productName;
export const CLI_PROCESS_NAME = `${productName}-cli`;

interface ProcessTitleTarget {
  title: string;
}

export const setCliProcessTitle = (
  target: ProcessTitleTarget = process,
): void => {
  target.title = CLI_PROCESS_NAME;
};

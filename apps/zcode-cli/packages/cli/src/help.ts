import { getZCodeCopy, type SupportedLocale, type UiLocale } from "@zcode/i18n";
import { CLI_COMMAND_NAME } from "./process-name.js";

export function formatCliHelp(
  version: string,
  locale?: UiLocale,
  detectedLocale?: SupportedLocale,
): string {
  // HZCode 等自有打包形态下，help 中的命令名跟随构建期产品名（specs/hzcode-packaging/spec.md）。
  return getZCodeCopy(locale, detectedLocale).cli.help(version, CLI_COMMAND_NAME);
}

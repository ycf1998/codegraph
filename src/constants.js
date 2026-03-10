/**
 * 常量定义
 * @module constants
 */

module.exports = {
  /** 自定义主目录（通过环境变量 CODEGRAPH_HOME 设置） */
  CODEGRAPH_HOME: process.env.CODEGRAPH_HOME || '',

  /** 存储类型：'json' | 'kuzu' | 'sqlite' */
  STORE_TYPE: 'json',

  /** 进度报告间隔（文件数） */
  PROGRESS_INTERVAL: 100,

  /** 默认查询深度（-1 表示无限） */
  DEFAULT_DEPTH: -1,

  /** 最大影响分析深度（-1 表示无限，但需注意循环调用风险） */
  DEFAULT_MAX_DEPTH: -1,

  /** 搜索结果限制（-1 表示无限制） */
  SEARCH_LIMIT: -1,

  /** 排除的目录名 */
  EXCLUDED_DIRS: ['node_modules', '.git', '.idea', '.svn', 'target', 'build', 'dist'],

  /** AST 节点类型 - Java */
  NODE_TYPES: {
    JAVA: {
      CLASS_DECLARATION: 'class_declaration',
      INTERFACE_DECLARATION: 'interface_declaration',
      ENUM_DECLARATION: 'enum_declaration',
      METHOD_DECLARATION: 'method_declaration',
      FIELD_DECLARATION: 'field_declaration',
      METHOD_INVOCATION: 'method_invocation',
      IMPORT_DECLARATION: 'import_declaration',
      VARIABLE_DECLARATOR: 'variable_declarator',
      TYPE_IDENTIFIER: 'type_identifier'
    }
  },

  /** 
   * 语言配置：文件扩展名 → 解析器模块路径
   * 使用字符串路径避免循环依赖
   * 路径相对于 parser/index.js
   */
  LANGUAGES: {
    '.java': {
      name: 'Java',
      parserModule: './JavaParser'
    }
    // 未来扩展示例：
    // '.ts': {
    //   name: 'TypeScript',
    //   parserModule: './TsParser'
    // },
    // '.tsx': {
    //   name: 'TypeScript',
    //   parserModule: './TsParser'
    // }
  }
};

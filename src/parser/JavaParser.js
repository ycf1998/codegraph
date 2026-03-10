/**
 * Java AST 解析器
 * 
 * 使用 Tree-sitter 解析 Java 源代码，提取：
 * - 符号定义（类、方法、字段）
 * - 方法调用关系
 * - 导入关系
 * - 类型引用关系
 * 
 * 继承自 Parser 抽象基类。
 * 
 * @module parser/JavaParser
 */

const Parser = require('tree-sitter');
const Java = require('tree-sitter-java');
const { NODE_TYPES } = require('../constants');
const BaseParser = require('./Parser');

const JAVA_NODE_TYPES = NODE_TYPES.JAVA;

/**
 * Java 解析器类
 * 继承自 Parser 抽象基类
 */
class JavaParser extends BaseParser {
  /**
   * 创建解析器实例
   */
  constructor() {
    super();
    this.parser = new Parser();
    this.parser.setLanguage(Java);
  }

  /**
   * @override
   * @param {string} filePath - 文件路径（相对路径）
   * @param {string} content - 文件内容
   * @returns {Object} 解析结果
   */
  parse(filePath, content) {
    const tree = this.parser.parse(content);

    const result = {
      file: filePath,
      symbols: [],
      calls: [],
      imports: [],
      references: []
    };

    this._extractSymbols(tree.rootNode, result);
    this._extractCalls(tree.rootNode, result);
    this._extractImports(tree.rootNode, result);

    return result;
  }

  /**
   * 提取符号定义
   * 
   * 递归遍历 AST，提取类、方法、字段定义。
   * 
   * @private
   * @param {TreeNode} node - AST 节点
   * @param {Object} result - 解析结果对象
   * @param {Object} context - 上下文信息
   * @param {string} context.className - 当前类名
   */
  _extractSymbols(node, result, context = {}) {
    const type = node.type;
    const startLine = node.startPosition.row + 1;

    // 类/接口/枚举定义
    if (this._isTypeDeclaration(type)) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const symbol = {
          name: nameNode.text,
          type: this._getDeclarationType(type),
          file: result.file,
          line: startLine,
          class: '',
          signature: this._getSignature(node)
        };
        result.symbols.push(symbol);

        // 递归处理类体
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          this._extractSymbols(bodyNode, result, { className: symbol.name });
        }
      }
      return; // 处理完类后返回，不再继续遍历子节点
    }

    // 方法定义
    if (type === JAVA_NODE_TYPES.METHOD_DECLARATION) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const returnTypeNode = node.childForFieldName('type');
        const paramsNode = node.childForFieldName('parameters');
        const params = this._extractParameters(paramsNode);
        const signature = `${returnTypeNode?.text || 'void'} ${nameNode.text}(${params.join(', ')})`;

        const symbol = {
          name: nameNode.text,
          type: 'method',
          file: result.file,
          line: startLine,
          class: context.className || '',
          returnType: returnTypeNode?.text || 'void',
          signature: signature
        };
        result.symbols.push(symbol);

        // 处理方法体中的调用
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          this._extractCalls(bodyNode, result, {
            methodName: symbol.name,
            className: context.className
          });
        }
      }
      return; // 处理完方法后返回
    }

    // 字段定义
    if (type === JAVA_NODE_TYPES.FIELD_DECLARATION) {
      for (const child of node.children) {
        if (child.type === JAVA_NODE_TYPES.VARIABLE_DECLARATOR) {
          const nameNode = child.childForFieldName('name');
          const typeNode = child.childForFieldName('type');
          if (nameNode) {
            const symbol = {
              name: nameNode.text,
              type: 'field',
              file: result.file,
              line: child.startPosition.row + 1,
              class: context.className || '',
              returnType: typeNode?.text || '',
              signature: ''
            };
            result.symbols.push(symbol);

            // 记录字段类型引用
            if (typeNode && typeNode.type === JAVA_NODE_TYPES.TYPE_IDENTIFIER) {
              result.references.push({
                from: nameNode.text,
                to: typeNode.text,
                type: 'references',
                file: result.file
              });
            }
          }
        }
      }
      return;
    }

    // 递归处理所有子节点
    for (const child of node.children) {
      this._extractSymbols(child, result, context);
    }
  }

  /**
   * 提取方法调用关系
   *
   * 遍历 AST，提取所有方法调用。
   * 调用关系包含调用者、被调用者、调用位置。
   *
   * 提取的调用类型：
   * - 普通方法调用：obj.method()
   * - 静态方法调用：Class.method()
   * - 对象创建：new Class()
   * - 构造函数调用：this() / super()
   *
   * @private
   * @param {TreeNode} node - AST 节点
   * @param {Object} result - 解析结果对象
   * @param {Object} context - 上下文信息
   * @param {string} context.methodName - 当前方法名
   * @param {string} context.className - 当前类名
   */
  _extractCalls(node, result, context = {}) {
    const type = node.type;

    // 方法调用
    if (type === JAVA_NODE_TYPES.METHOD_INVOCATION) {
      const nameNode = node.childForFieldName('name');
      const objectNode = node.childForFieldName('object');

      if (nameNode) {
        const calleeName = nameNode.text;
        const receiver = objectNode?.text || '';

        result.calls.push({
          caller: context.methodName || '',
          callerClass: context.className || '',
          callee: calleeName,
          calleeClass: receiver,
          file: result.file,
          line: node.startPosition.row + 1
        });
      }
    }

    // 对象创建调用：new ClassName()
    if (type === 'object_creation_expression') {
      const typeNode = node.childForFieldName('type');
      if (typeNode) {
        const typeName = typeNode.childForFieldName('name')?.text || typeNode.text;
        result.calls.push({
          caller: context.methodName || '',
          callerClass: context.className || '',
          callee: '<init>',
          calleeClass: typeName,
          file: result.file,
          line: node.startPosition.row + 1
        });
      }
    }

    // 显式构造函数调用：this(...) / super(...)
    if (type === 'explicit_constructor_invocation') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        result.calls.push({
          caller: context.methodName || '',
          callerClass: context.className || '',
          callee: nameNode.text,
          calleeClass: context.className || '',
          file: result.file,
          line: node.startPosition.row + 1
        });
      }
    }

    // 递归处理所有子节点
    for (const child of node.children) {
      this._extractCalls(child, result, context);
    }
  }

  /**
   * 提取导入关系
   * 
   * @private
   * @param {TreeNode} node - AST 节点
   * @param {Object} result - 解析结果对象
   */
  _extractImports(node, result) {
    const type = node.type;

    // 导入语句
    if (type === JAVA_NODE_TYPES.IMPORT_DECLARATION) {
      const importNode = node.childForFieldName('name');
      if (importNode) {
        const importPath = importNode.text;
        const importParts = importPath.split('.');
        const symbolName = importParts[importParts.length - 1];

        result.imports.push({
          symbol: symbolName,
          from: importParts.slice(0, -1).join('.'),
          file: result.file
        });
      }
    }

    // 递归处理所有子节点
    for (const child of node.children) {
      this._extractImports(child, result);
    }
  }

  /**
   * 判断是否为类型声明（类/接口/枚举）
   * @private
   * @param {string} type - 节点类型
   * @returns {boolean}
   */
  _isTypeDeclaration(type) {
    return type === JAVA_NODE_TYPES.CLASS_DECLARATION ||
           type === JAVA_NODE_TYPES.INTERFACE_DECLARATION ||
           type === JAVA_NODE_TYPES.ENUM_DECLARATION;
  }

  /**
   * 获取声明类型字符串
   * @private
   * @param {string} type - 节点类型
   * @returns {string}
   */
  _getDeclarationType(type) {
    return type.replace('_declaration', '');
  }

  /**
   * 获取节点签名（第一行代码，最多 100 字符）
   * @private
   * @param {TreeNode} node - AST 节点
   * @returns {string}
   */
  _getSignature(node) {
    const text = node.text.split('\n')[0];
    return text.substring(0, 100);
  }

  /**
   * 提取方法参数
   * @private
   * @param {TreeNode} paramsNode - 参数节点
   * @returns {Array<string>} 参数列表
   */
  _extractParameters(paramsNode) {
    const params = [];
    if (!paramsNode) return params;

    for (const child of paramsNode.children) {
      if (child.type === 'formal_parameter') {
        const typeNode = child.childForFieldName('type');
        const nameNode = child.childForFieldName('name');
        if (typeNode && nameNode) {
          params.push(`${typeNode.text} ${nameNode.text}`);
        }
      }
    }
    return params;
  }
}

module.exports = JavaParser;

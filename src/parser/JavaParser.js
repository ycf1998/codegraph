/**
 * Java AST 解析器
 *
 * 使用 Tree-sitter 解析 Java 源代码，提取：
 * - 符号定义（类、方法、字段）
 * - 方法调用关系
 * - 导入关系
 * - 类型引用关系
 * - 字段类型映射
 *
 * 准确度优化：
 * - 字段类型追踪（支持依赖注入）
 * - 链式调用提取
 * - 返回类型推断
 * - 继承/实现关系提取
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
    // 字段类型映射：fieldName -> { typeName, className }
    this.fieldTypes = new Map();
  }

  /**
   * @override
   * @param {string} filePath - 文件路径（相对路径）
   * @param {string} content - 文件内容
   * @returns {Object} 解析结果
   */
  parse(filePath, content) {
    const tree = this.parser.parse(content);
    
    // 重置字段类型映射
    this.fieldTypes.clear();

    const result = {
      file: filePath,
      symbols: [],
      calls: [],
      imports: [],
      references: [],
      fieldTypes: {}  // 新增：字段类型映射
    };

    // 第一遍：提取符号和字段类型
    this._extractSymbols(tree.rootNode, result);
    
    // 第二遍：提取调用关系（使用字段类型映射）
    this._extractCallsTree(tree.rootNode, result);
    
    // 提取导入关系
    this._extractImports(tree.rootNode, result);
    
    // 提取继承/实现关系
    this._extractInheritance(tree.rootNode, result);

    // 添加字段类型映射到结果
    result.fieldTypes = Object.fromEntries(this.fieldTypes);

    return result;
  }

  /**
   * 第二遍遍历：提取调用关系
   * @private
   */
  _extractCallsTree(node, result, context = {}) {
    const type = node.type;

    // 类/接口/枚举定义 - 传递 className
    if (this._isTypeDeclaration(type)) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          this._extractCallsTree(bodyNode, result, { className: nameNode.text });
        }
      }
      return;
    }

    // 方法定义 - 传递 methodName 和 className
    if (type === JAVA_NODE_TYPES.METHOD_DECLARATION) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          this._extractCallsTree(bodyNode, result, {
            methodName: nameNode.text,
            className: context.className
          });
        }
      }
      return;
    }

    // 方法调用
    if (type === JAVA_NODE_TYPES.METHOD_INVOCATION) {
      const nameNode = node.childForFieldName('name');
      const objectNode = node.childForFieldName('object');

      if (nameNode) {
        const calleeName = nameNode.text;
        let receiver = objectNode?.text || '';
        let calleeClass = receiver;

        // 准确度优化：如果 receiver 是字段，使用字段类型
        if (receiver && context.className) {
          const fieldKey = `${context.className}.${receiver}`;
          const fieldType = this.fieldTypes.get(fieldKey);
          if (fieldType) {
            calleeClass = fieldType.typeName;
          }
        }

        result.calls.push({
          caller: context.methodName || '',
          callerClass: context.className || '',
          callee: calleeName,
          calleeClass: calleeClass,
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
      this._extractCallsTree(child, result, context);
    }
  }

  /**
   * 提取符号定义
   *
   * 递归遍历 AST，提取类、方法、字段定义。
   * 同时收集字段类型映射用于后续调用分析。
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
      }
      return; // 处理完方法后返回，调用关系会在第二遍提取
    }

    // 字段定义 - 重要：收集字段类型用于依赖注入分析
    if (type === JAVA_NODE_TYPES.FIELD_DECLARATION) {
      for (const child of node.children) {
        if (child.type === JAVA_NODE_TYPES.VARIABLE_DECLARATOR) {
          const nameNode = child.childForFieldName('name');
          
          // 获取类型节点：查找 type_identifier 子节点
          let typeName = '';
          for (const c of node.children) {
            if (c.type === 'type_identifier' || c.type === 'generic_type') {
              const typeNode = c.childForFieldName('name') || c;
              typeName = typeNode.text;
              break;
            }
          }
          
          if (nameNode) {
            const symbol = {
              name: nameNode.text,
              type: 'field',
              file: result.file,
              line: child.startPosition.row + 1,
              class: context.className || '',
              returnType: typeName,
              signature: ''
            };
            result.symbols.push(symbol);

            // 记录字段类型映射（用于依赖注入）
            if (context.className && typeName) {
              const fieldKey = `${context.className}.${nameNode.text}`;
              this.fieldTypes.set(fieldKey, {
                typeName: typeName,
                className: context.className
              });
            }

            // 记录字段类型引用
            if (typeName) {
              result.references.push({
                from: nameNode.text,
                to: typeName,
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
   * 提取继承/实现关系
   *
   * @private
   * @param {TreeNode} node - AST 节点
   * @param {Object} result - 解析结果对象
   */
  _extractInheritance(node, result) {
    const type = node.type;

    // 类继承：extends
    if (type === JAVA_NODE_TYPES.CLASS_DECLARATION) {
      const nameNode = node.childForFieldName('name');
      const superClassNode = node.childForFieldName('superclass');
      
      if (nameNode && superClassNode) {
        const superClass = superClassNode.childForFieldName('name')?.text || superClassNode.text;
        result.references.push({
          from: nameNode.text,
          to: superClass,
          type: 'extends',
          file: result.file
        });
      }
    }

    // 接口实现：implements
    if (type === JAVA_NODE_TYPES.CLASS_DECLARATION || type === JAVA_NODE_TYPES.ENUM_DECLARATION) {
      const nameNode = node.childForFieldName('name');
      const interfacesNode = node.childForFieldName('interfaces');
      
      if (nameNode && interfacesNode) {
        for (const child of interfacesNode.children) {
          if (child.type === 'type_identifier') {
            result.references.push({
              from: nameNode.text,
              to: child.text,
              type: 'implements',
              file: result.file
            });
          }
        }
      }
    }

    // 接口继承：extends
    if (type === JAVA_NODE_TYPES.INTERFACE_DECLARATION) {
      const nameNode = node.childForFieldName('name');
      const interfacesNode = node.childForFieldName('interfaces');
      
      if (nameNode && interfacesNode) {
        for (const child of interfacesNode.children) {
          if (child.type === 'type_identifier') {
            result.references.push({
              from: nameNode.text,
              to: child.text,
              type: 'extends',
              file: result.file
            });
          }
        }
      }
    }

    // 递归处理所有子节点
    for (const child of node.children) {
      this._extractInheritance(child, result);
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

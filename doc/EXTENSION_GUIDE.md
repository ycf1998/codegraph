# codegraph 扩展开发指南

本文档说明如何为 codegraph 添加新的编程语言解析器和存储实现。

## 架构概述

codegraph 采用**接口 + 实现**的架构模式：

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI (index.js)                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌──────────────────┐          ┌──────────────────┐
│   parser/        │          │   storage/       │
│   - Parser.js    │          │   - Store.js     │
│   - JavaParser   │          │   - json-store   │
│   - index.js     │          │   - index.js     │
└──────────────────┘          └──────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  constants.js    │
              └──────────────────┘
```

- **Parser** - 解析器基类，定义 `parse()` 接口
- **Store** - 存储基类，定义数据存取接口
- **constants.js** - 统一配置中心

---

## 扩展 1：添加新语言解析器

### 步骤 1：创建解析器类

在 `src/parser/` 创建新的解析器文件，如 `TsParser.js`：

```javascript
/**
 * TypeScript AST 解析器
 * @module parser/TsParser
 */

const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript');
const BaseParser = require('./Parser');

class TsParser extends BaseParser {
  constructor() {
    super();
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript.typescript);
  }

  /**
   * @override
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
   * @private
   */
  _extractSymbols(node, result, context = {}) {
    const type = node.type;
    const startLine = node.startPosition.row + 1;

    // 类定义
    if (type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        result.symbols.push({
          name: nameNode.text,
          type: 'class',
          file: result.file,
          line: startLine,
          class: '',
          signature: node.text.substring(0, 100)
        });

        // 递归处理类体
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          this._extractSymbols(bodyNode, result, { className: nameNode.text });
        }
      }
      return;
    }

    // 方法定义
    if (type === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const symbol = {
          name: nameNode.text,
          type: 'method',
          file: result.file,
          line: startLine,
          class: context.className || '',
          returnType: 'any',
          signature: node.text.substring(0, 100)
        };
        result.symbols.push(symbol);

        // 提取方法体中的调用
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          this._extractCalls(bodyNode, result, {
            methodName: symbol.name,
            className: context.className
          });
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
   * 提取调用关系
   * @private
   */
  _extractCalls(node, result, context = {}) {
    const type = node.type;

    // 方法调用
    if (type === 'call_expression') {
      const functionNode = node.childForFieldName('function');
      if (functionNode && functionNode.type === 'property_identifier') {
        result.calls.push({
          caller: context.methodName || '',
          callerClass: context.className || '',
          callee: functionNode.text,
          calleeClass: '',
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
   * @private
   */
  _extractImports(node, result) {
    const type = node.type;

    // 导入语句
    if (type === 'import_statement') {
      const sourceNode = node.childForFieldName('source');
      if (sourceNode) {
        result.imports.push({
          symbol: sourceNode.text,
          from: sourceNode.text,
          file: result.file
        });
      }
    }

    // 递归处理所有子节点
    for (const child of node.children) {
      this._extractImports(child, result);
    }
  }
}

module.exports = TsParser;
```

### 步骤 2：注册语言配置

在 `src/constants.js` 的 `LANGUAGES` 中添加：

```javascript
LANGUAGES: {
  '.java': {
    name: 'Java',
    parserModule: './JavaParser'
  },
  '.ts': {
    name: 'TypeScript',
    parserModule: './TsParser'
  },
  '.tsx': {
    name: 'TypeScript',
    parserModule: './TsParser'
  }
}
```

### 步骤 3：安装依赖

```bash
npm install tree-sitter-typescript
```

### 步骤 4：测试

```bash
# 索引 TypeScript 项目
node src/index.js index ts-project.zip --name my-ts-project

# 查询
node src/index.js callers myFunction --project my-ts-project
```

---

## 扩展 2：添加新存储实现

### 步骤 1：创建存储类

在 `src/storage/` 创建新的存储文件，如 `kuzu-store.js`：

```javascript
/**
 * KuzuDB 存储实现
 * @module storage/kuzu-store
 */

const Store = require('./Store');
const kuzu = require('kuzu');
const path = require('path');
const fs = require('fs');

class KuzuStore extends Store {
  /**
   * @override
   */
  constructor(dbPath) {
    super(dbPath);
    this.db = null;
    this.conn = null;
  }

  /**
   * @override
   */
  async init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new kuzu.Database(this.dbPath);
    this.conn = new kuzu.Connection(this.db);

    this._createSchema();
  }

  /**
   * 创建数据库模式
   * @private
   */
  _createSchema() {
    this.conn.query(`CREATE NODE TABLE IF NOT EXISTS Symbol (
      name STRING,
      type STRING,
      file STRING,
      line INT64,
      class STRING,
      PRIMARY KEY (name, class)
    )`);

    this.conn.query(`CREATE REL TABLE IF NOT EXISTS CALLS (
      FROM Symbol TO Symbol,
      file STRING,
      line INT64
    )`);
  }

  /**
   * @override
   */
  async insertSymbol(symbol) {
    try {
      this.conn.query(`INSERT INTO Symbol VALUES (
        '${symbol.name}',
        '${symbol.type}',
        '${symbol.file}',
        ${symbol.line},
        '${symbol.class}'
      )`);
    } catch (e) {
      // 忽略重复插入
    }
  }

  /**
   * @override
   */
  async insertCall(callerName, callerClass, calleeName, calleeClass, file, line) {
    try {
      this.conn.query(`MATCH (a:Symbol), (b:Symbol)
        WHERE a.name = '${callerName}' AND a.class = '${callerClass}'
          AND b.name = '${calleeName}' AND b.class = '${calleeClass}'
        INSERT (a)-[:CALLS {file: '${file}', line: ${line}}]->(b)`);
    } catch (e) {
      // 忽略
    }
  }

  /**
   * @override
   */
  findCallers(symbolName, symbolClass, depth = 1) {
    const range = depth > 1 ? `*1..${depth}` : '';
    
    const result = this.conn.query(`
      MATCH (caller:Symbol)-[:CALLS${range}]->(target:Symbol)
      WHERE target.name = '${symbolName}' AND target.class = '${symbolClass}'
      RETURN caller.name, caller.class, caller.file, caller.line
    `);
    
    return this._extractRows(result);
  }

  /**
   * @override
   */
  async save() {
    // KuzuDB 自动持久化
  }

  /**
   * @override
   */
  close() {
    if (this.conn) this.conn.close();
    if (this.db) this.db.close();
  }

  /**
   * 提取查询结果行
   * @private
   */
  _extractRows(result) {
    const rows = [];
    while (result.hasNext()) {
      const row = result.getNext();
      rows.push(row.getValue());
    }
    return rows;
  }

  // ... 实现其他必需方法
}

module.exports = KuzuStore;
```

### 步骤 2：注册存储类型

在 `src/storage/index.js` 中添加：

```javascript
const KuzuStore = require('./kuzu-store');

function createStore(type = STORE_TYPE, dbPath) {
  switch (type.toLowerCase()) {
    case 'json':
      return new JsonStore(dbPath);
    case 'kuzu':
      return new KuzuStore(dbPath);
    default:
      throw new Error(`Unknown store type: ${type}`);
  }
}
```

### 步骤 3：修改存储配置

在 `src/constants.js` 中修改：

```javascript
STORE_TYPE: 'kuzu'  // 或 'json'
```

### 步骤 4：安装依赖

```bash
npm install kuzu
```

### 步骤 5：测试

```bash
node src/index.js index test-project.zip --name test-project --force
node src/index.js callers getUser --class UserService --project test-project
```

---

## 开发规范

### 1. 必须实现的方法

**Parser 子类必须实现：**
- `parse(filePath, content)` - 返回标准格式结果

**Store 子类必须实现：**
- `init()` - 初始化存储
- `insertSymbol(symbol)` - 插入符号
- `insertFile(file)` - 插入文件
- `insertCall(...)` - 插入调用关系
- `insertReference(...)` - 插入引用关系
- `insertDefinesIn(...)` - 插入定义关系
- `findCallers(...)` - 查找调用者
- `findCallees(...)` - 查找被调用
- `findDependencies(...)` - 查找依赖
- `findImpact(...)` - 影响分析
- `searchSymbols(...)` - 搜索符号
- `getStats()` - 获取统计
- `save()` - 保存数据
- `close()` - 关闭存储

### 2. 数据格式规范

**解析结果格式：**
```javascript
{
  file: 'MyClass.java',
  symbols: [
    {
      name: 'myMethod',
      type: 'method',
      file: 'MyClass.java',
      line: 10,
      class: 'MyClass',
      returnType: 'void',
      signature: 'void myMethod(String arg)'
    }
  ],
  calls: [
    {
      caller: 'myMethod',
      callerClass: 'MyClass',
      callee: 'otherMethod',
      calleeClass: 'OtherClass',
      file: 'MyClass.java',
      line: 15
    }
  ],
  imports: [],
  references: []
}
```

**查询结果格式：**
```javascript
[
  {
    name: 'otherMethod',
    class: 'OtherClass',
    file: 'OtherClass.java',
    line: 20,
    depth: 1
  }
]
```

### 3. 测试要求

- 确保通过所有现有测试
- 添加新语言的测试用例
- 测试不同深度查询
- 测试大文件性能

---

## 参考资源

- [Tree-sitter 官方文档](https://tree-sitter.github.io/)
- [Tree-sitter Java](https://github.com/tree-sitter/tree-sitter-java)
- [Tree-sitter TypeScript](https://github.com/tree-sitter/tree-sitter-typescript)
- [KuzuDB 文档](https://docs.kuzudb.com/)

---

## 常见问题

### Q: 如何处理循环依赖？

A: 使用 `visited` 集合跟踪已访问节点，防止无限递归。

### Q: 如何处理大小写不一致？

A: 在查询方法中实现模糊匹配逻辑，参考 `JsonStore._fuzzyMatchSymbol()`。

### Q: 如何优化大文件性能？

A: 
1. 使用内存索引加速查询
2. 批量插入减少 I/O
3. 考虑使用数据库存储（如 KuzuDB）

### Q: 如何调试解析器？

A:
```javascript
const tree = this.parser.parse(content);
console.log(tree.rootNode.toString());  // 打印 AST 结构
```

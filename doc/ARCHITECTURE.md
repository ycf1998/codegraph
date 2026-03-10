# codegraph 架构设计文档

## 1. 项目定位

基于 Tree-sitter AST 解析的静态代码调用关系分析工具。

**核心理念：** 用成熟的 AST 解析技术，提供准确的代码调用关系分析。

**目标用户：**
- 开发者：代码重构前分析影响范围
- 代码审查：快速了解调用关系

**能力边界：**
- ✅ 静态方法调用关系
- ✅ 类/接口依赖关系
- ❌ 反射调用（无法检测）
- ❌ 运行时依赖注入（部分支持）
- ❌ 语义理解/业务逻辑

**支持语言：**
- ✅ Java (已实现)
- 🔜 TypeScript (扩展中)
- 🔜 Python (扩展中)

---

## 2. 架构设计

### 2.1 设计模式

采用**接口 + 实现**的架构模式：

- **Parser 接口** - 定义 `parse()` 方法，所有语言解析器继承实现
- **Store 接口** - 定义数据存取接口，所有存储实现继承实现
- **constants.js** - 统一配置中心，管理语言映射和存储类型

### 2.2 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      CLI (src/cli/index.js)                  │
│  - 命令解析                                                   │
│  - 参数处理                                                   │
│  - 结果输出                                                   │
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
│   (工厂)         │          │   (工厂)         │
└──────────────────┘          └──────────────────┘
        │                               │
        └───────────────┬───────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  constants.js    │
              │  - STORE_TYPE    │
              │  - LANGUAGES     │
              │  - NODE_TYPES    │
              └──────────────────┘
```

### 2.3 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| **CLI** | `cli/index.js` | 命令解析、参数处理、结果输出 |
| **Parser 基类** | `parser/Parser.js` | 定义 `parse()` 接口 |
| **语言解析器** | `parser/JavaParser.js` | Java AST 解析，提取符号和调用关系 |
| **Parser 工厂** | `parser/index.js` | 根据文件扩展名自动选择解析器 |
| **Store 基类** | `storage/Store.js` | 定义数据存取接口 |
| **存储实现** | `storage/json-store.js` | JSON 文件存储，内存索引加速 |
| **Store 工厂** | `storage/index.js` | 根据配置创建存储实例 |
| **配置中心** | `constants.js` | 存储类型、语言映射、节点类型定义 |

---

## 3. 技术选型

### 3.1 核心技术栈

| 组件 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **AST 解析** | Tree-sitter | ^0.21.0 | 跨语言 AST 解析器 |
| **Java 语法** | tree-sitter-java | ^0.23.0 | Java 文法规则 |
| **CLI 框架** | Commander | ^12.0.0 | Node.js CLI 框架 |
| **ZIP 处理** | AdmZip | ^0.5.0 | 纯 JS ZIP 库 |
| **运行时** | Node.js | >=18.0.0 | JavaScript 运行时 |

### 3.2 存储方案

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| **JSON 文件** | 零依赖，简单，跨平台 | 复杂查询性能较弱 | ✅ 当前方案 |
| **LadybugDB** | 原生图存储、Cypher 查询 | 需要原生模块 | 🔜 备选 |
| **SQLite** | 成熟，支持 SQL | 需要原生模块 | 🔜 备选 |

**选择 JSON 方案原因：**
- 零依赖，无需安装数据库
- 纯 JavaScript 实现，跨平台兼容性好
- 数据格式透明，易于调试和备份
- 对于 10-50 万行代码规模性能足够

---

## 4. 数据模型

### 4.1 索引数据结构

```json
{
  "symbols": [
    {
      "name": "getUser",
      "type": "method",
      "class": "UserService",
      "file": "UserService.java",
      "line": 11,
      "returnType": "User",
      "signature": "User getUser(Long id)"
    }
  ],
  "calls": [
    {
      "caller": "getUser",
      "callerClass": "UserService",
      "callee": "getById",
      "calleeClass": "UserMapper",
      "file": "UserService.java",
      "line": 12
    }
  ],
  "references": [],
  "imports": [],
  "files": []
}
```

### 4.2 实体关系

```
┌──────────────┐         CALLS          ┌──────────────┐
│   Symbol     │ ─────────────────────> │   Symbol     │
│  (caller)    │                        │  (callee)    │
└──────────────┘                        └──────────────┘
       │                                       │
       │ DEFINES_IN                            │ DEFINES_IN
       ▼                                       ▼
┌──────────────┐                        ┌──────────────┐
│    File      │                        │    File      │
└──────────────┘                        └──────────────┘
```

---

## 5. 核心流程

### 5.1 索引创建流程

```
ZIP 文件
   │
   ▼
┌─────────────────┐
│ 1. 解压到临时目录 │
└─────────────────┘
   │
   ▼
┌─────────────────┐
│ 2. 扫描源文件     │ (根据扩展名自动识别语言)
└─────────────────┘
   │
   ▼
┌─────────────────┐
│ 3. AST 解析      │ (使用对应语言的 Parser)
└─────────────────┘
   │
   ▼
┌─────────────────┐
│ 4. 提取符号      │
│    - 类/接口     │
│    - 方法        │
│    - 字段        │
└─────────────────┘
   │
   ▼
┌─────────────────┐
│ 5. 提取调用关系  │
│    - method_invocation │
└─────────────────┘
   │
   ▼
┌─────────────────┐
│ 6. 存入存储      │ (JSON/KuzuDB/SQLite)
└─────────────────┘
   │
   ▼
~/.codegraph/indexes/<project>/db/index.json
```

### 5.2 callers 查询流程

```
用户输入：callers getUser --class UserService
   │
   ▼
┌─────────────────────────────────────────┐
│ 1. 加载索引                              │
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│ 2. 查找目标符号                          │
│    symbolIndex.get("UserService:getUser")│
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│ 3. 查找调用关系                          │
│    callerIndex.get("UserService:getUser")│
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│ 4. 关联调用者符号信息                    │
│    symbolIndex.get(callerId)            │
└─────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────┐
│ 5. 格式化输出                            │
│    UserController.getUser               │
│      (UserController.java:15)           │
└─────────────────────────────────────────┘
```

---

## 6. 项目结构

```
codegraph/
├── src/
│   ├── index.js              # CLI 入口
│   ├── cli/
│   │   └── index.js          # CLI 命令定义和实现
│   ├── parser/
│   │   ├── Parser.js         # 解析器抽象基类
│   │   ├── JavaParser.js     # Java AST 解析器
│   │   └── index.js          # 解析器工厂
│   ├── storage/
│   │   ├── Store.js          # 存储抽象基类
│   │   ├── json-store.js     # JSON 存储实现
│   │   └── index.js          # 存储工厂
│   └── constants.js          # 统一配置中心
├── doc/
│   ├── ARCHITECTURE.md       # 本文件
│   ├── ROADMAP.md            # 开发路线图
│   └── EXTENSION_GUIDE.md    # 扩展开发指南
├── test-project/             # 测试项目
├── package.json
├── README.md                 # 使用说明
└── .gitignore
```

---

## 7. 性能指标

### 7.1 索引性能

| 项目规模 | 解析时间 | 索引大小 |
|----------|----------|----------|
| 1 万行 | 1-2 秒 | 0.5 MB |
| 10 万行 | 8-12 秒 | 2-3 MB |
| 100 万行 | 80-120 秒 | 20-30 MB |

### 7.2 查询性能

| 查询类型 | 数据量 | 耗时 |
|----------|--------|------|
| callers (1 层) | 10 万行 | < 0.1 秒 |
| callers (3 层) | 10 万行 | 0.2-0.3 秒 |
| callees | 10 万行 | < 0.1 秒 |
| deps | 10 万行 | < 0.1 秒 |
| impact | 10 万行 | 0.1-0.2 秒 |

---

## 8. 限制与边界

### 8.1 准确度限制

| 场景 | 准确度 | 说明 |
|------|--------|------|
| 普通方法调用 | ⭐⭐⭐⭐⭐ | AST 精确匹配 |
| 接口 vs 实现 | ⭐⭐⭐ | 只能识别显式调用 |
| 反射调用 | ❌ | 无法检测 `method.invoke()` |
| 框架注入 | ⭐⭐ | Spring `@Autowired` 部分支持 |
| Lambda 表达式 | ⭐⭐⭐ | 部分支持 |

### 8.2 资源边界

| 指标 | 限制 | 说明 |
|------|------|------|
| 单文件最大 | 10 MB | 过大会内存溢出 |
| 内存占用 | ~300MB/10 万行 | AST 遍历需要 |
| 索引深度 | -1 (无限) | 使用 visited 集合防止循环 |

---

## 9. 配置说明

在 `src/constants.js` 中配置：

```javascript
module.exports = {
  // 存储类型：'json' | 'kuzu' | 'sqlite'
  STORE_TYPE: 'json',
  
  // 默认查询深度：-1 表示无限
  DEFAULT_DEPTH: -1,
  
  // 最大影响分析深度：-1 表示无限
  DEFAULT_MAX_DEPTH: -1,
  
  // 搜索结果限制：-1 表示无限制
  SEARCH_LIMIT: -1,
  
  // 语言配置
  LANGUAGES: {
    '.java': {
      name: 'Java',
      parserModule: './JavaParser'
    }
  }
};
```

---

## 10. 参考资源

- [Tree-sitter](https://tree-sitter.github.io/)
- [Commander.js](https://github.com/tj/commander.js)
- [扩展开发指南](./EXTENSION_GUIDE.md) - 如何添加新语言和存储

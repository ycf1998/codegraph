# codegraph - 代码调用关系分析工具

基于 Tree-sitter AST 解析的静态代码调用关系分析 CLI 工具。

**主要用途：**
- 重构前分析调用影响范围
- 快速查找方法的调用者/被调用者
- 查看类/方法之间的依赖关系

**支持语言：**
- ✅ Java (已实现)
- 🔜 TypeScript (扩展中)
- 🔜 Python (扩展中)

## 快速开始

### 安装依赖

```bash
cd codegraph
npm install
```

### 使用

```bash
# 1. 索引项目（从 ZIP 包，自动识别语言）
node src/index.js index /path/to/project.zip --name my-project

# 2. 查找调用者
node src/index.js callers getUser --class UserService

# 3. 查找被调用
node src/index.js callees getUser --class UserService

# 4. 查看依赖
node src/index.js deps UserController

# 5. 影响分析
node src/index.js impact getUser --class UserService
```

### 支持的语言

| 语言 | 文件扩展名 | 状态 |
|------|------------|------|
| Java | `.java` | ✅ 已支持 |
| TypeScript | `.ts`, `.tsx` | 🔜 扩展中 |
| Python | `.py` | 🔜 扩展中 |

> 语言根据文件扩展名自动识别，无需手动指定。

### 全局安装（可选）

```bash
npm link
```

然后可以直接使用：

```bash
codegraph index project.zip --name my-project
codegraph callers getUser --class UserService
```

## CLI 命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `index <zip>` | 从 ZIP 包创建索引 | `codegraph index project.zip --name my-project` |
| `callers <symbol>` | 查找调用者 | `codegraph callers getUser --class UserService` |
| `callees <symbol>` | 查找被调用 | `codegraph callees getUser --class UserService` |
| `deps <target>` | 查看依赖 | `codegraph deps UserController` |
| `impact <symbol>` | 影响分析 | `codegraph impact getUser --class UserService` |

### 通用选项

- `--project <name>`: 指定项目名称（多项目时使用）
- `--class <name>`: 限定类名
- `--depth <n>`: 查询深度（默认 1）
- `--json`: 输出 JSON 格式
- `--force`: 强制重新索引

## 项目结构

```
codegraph/
├── src/
│   ├── index.js            # CLI 入口
│   ├── cli/
│   │   └── index.js        # CLI 命令定义
│   ├── parser/
│   │   ├── Parser.js       # 解析器抽象基类
│   │   ├── JavaParser.js   # Java AST 解析器
│   │   └── index.js        # 解析器工厂
│   ├── storage/
│   │   ├── Store.js        # 存储抽象基类
│   │   ├── json-store.js   # JSON 存储实现
│   │   └── index.js        # 存储工厂
│   └── constants.js        # 统一配置中心
├── doc/
│   ├── ARCHITECTURE.md     # 架构设计文档
│   ├── ROADMAP.md          # 开发路线图
│   └── EXTENSION_GUIDE.md  # 扩展开发指南
├── package.json
└── README.md
```

## 技术栈

- **Tree-sitter**: AST 解析引擎
- **Commander**: CLI 框架
- **AdmZip**: ZIP 文件处理
- **JSON**: 本地索引存储（可扩展 KuzuDB、SQLite）

## 配置

在 `src/constants.js` 中配置：

```javascript
module.exports = {
  STORE_TYPE: 'json',  // 存储类型：'json' | 'kuzu' | 'sqlite'
  DEFAULT_DEPTH: -1,   // 默认查询深度：-1 表示无限
  LANGUAGES: {
    '.java': { name: 'Java', parserModule: './JavaParser' }
  }
};
```

## 扩展开发

查看 [doc/EXTENSION_GUIDE.md](doc/EXTENSION_GUIDE.md) 了解如何：
- 添加新的编程语言解析器
- 添加新的存储实现

## 数据存储

索引存储在 `~/.codegraph/indexes/<project-name>/db/index.json`

```
~/.codegraph/
├── registry.json            # 项目注册表
└── indexes/
    ├── my-project/
    │   └── db/
    │       └── index.json   # JSON 索引文件
    └── another-project/
        └── db/
            └── index.json
```

## 示例

### 1. 索引 Java 项目

```bash
# 打包项目为 ZIP
zip -r my-project.zip .

# 创建索引
node src/index.js index my-project.zip --name my-project
```

输出：
```
Extracting ZIP...
  ✓ Extracted to ~/.codegraph/indexes/my-project/temp
Initializing storage...
Parsing files...
Building graph... done (33 symbols, 14 relationships)
Index saved to ~/.codegraph/indexes/my-project
```

### 2. 查找调用者

```bash
node src/index.js callers getUser --class UserService
```

输出：
```
Callers of "UserService.getUser" in my-project:

  UserController.getUser (UserController.java:15)

Found 1 caller(s)
```

### 3. 查找被调用

```bash
node src/index.js callees getUser --class UserService
```

输出：
```
UserService.getUser calls:

  UserMapper.getById (UserMapper.java:5)

Found 1 callee(s)
```

### 4. 影响分析

```bash
node src/index.js impact getUser --class UserService
```

输出：
```
Impact Analysis for "UserService.getUser":

Direct Impact (1 files):
  - UserController.getUser

Indirect Impact (0 files):
```

### 5. 多层调用链

```bash
node src/index.js callers getUser --class UserService --depth 3
```

输出：
```
Callers of "UserService.getUser" in my-project:

  UserController.getUser (UserController.java:15)
  OrderController.create (OrderController.java:10) (depth 2)

Found 2 caller(s)
```

## 开发

### 调试

```bash
# 测试单个文件
node -e "
  const JavaParser = require('./src/parser/JavaParser');
  const fs = require('fs');
  const parser = new JavaParser();
  const result = parser.parse('Test.java', fs.readFileSync('Test.java', 'utf-8'));
  console.log(JSON.stringify(result, null, 2));
"
```

## 限制

- 目前仅支持 Java（其他语言待添加）
- 反射调用无法检测
- 框架注入（如 Spring @Autowired）部分支持

## 参考

- [Tree-sitter](https://tree-sitter.github.io/)

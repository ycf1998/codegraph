/**
 * CLI 命令实现
 * 
 * 提供代码分析相关的命令行接口：
 * - index: 从 ZIP 包创建索引
 * - callers: 查找调用者
 * - callees: 查找被调用
 * - deps: 查看依赖
 * - impact: 影响分析
 * 
 * 支持多语言：Java (已实现), TypeScript, Python (待扩展)
 * 
 * @module cli/index
 */

const { Command } = require('commander');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const { createParserForFile, getSupportedExtensions, getLanguageName } = require('../parser');
const { createStore } = require('../storage');
const {
  PROGRESS_INTERVAL,
  DEFAULT_DEPTH,
  CODEGRAPH_HOME,
  STORE_TYPE,
  LANGUAGES
} = require('../constants');

const command = new Command();

command
  .name('codegraph')
  .description('静态代码调用关系分析工具（支持多语言）')
  .version('1.0.0');

/**
 * 创建存储实例
 * @private
 * @param {string} projectName - 项目名称
 * @returns {Promise<Store>} 存储实例
 */
async function createStoreInstance(projectName) {
  const dbPath = path.join(getCodegraphHome(), 'indexes', projectName, 'db');
  
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Index not found for project "${projectName}"`);
  }
  
  const store = createStore(STORE_TYPE, path.join(dbPath, 'index.json'));
  await store.init();
  return store;
}

/**
 * 格式化查询结果为 JSON 输出
 * @private
 * @param {string} type - 结果类型 (callers/callees)
 * @param {Object} options - 命令选项
 * @param {Array} results - 查询结果
 * @returns {Object}
 */
function formatResults(type, options, results) {
  return {
    [type]: results.map(r => ({
      name: r.name,
      class: r.class,
      file: r.file,
      line: r.line,
      depth: r.depth
    })),
    total: results.length
  };
}

/**
 * 输出查询结果到控制台
 * @private
 * @param {string} type - 结果类型
 * @param {Object} options - 命令选项
 * @param {Array} results - 查询结果
 */
function printResults(type, options, results) {
  const label = type === 'callers' ? 'Callers of' : 'calls';
  const symbolLabel = options.class ? `${options.class}.${options.symbol}` : options.symbol;
  
  console.log(`\n${label} "${symbolLabel}" in ${options.project}:\n`);

  if (results.length === 0) {
    console.log(`  No ${type} found.`);
  } else {
    for (const r of results) {
      const depth = r.depth > 1 ? ` (depth ${r.depth})` : '';
      console.log(`  ${r.class}.${r.name} (${r.file}:${r.line})${depth}`);
    }
    console.log(`\nFound ${results.length} ${type}(s)`);
  }
}

// ============================================================================
// index 命令
// ============================================================================
command
  .command('index <zipPath>')
  .description('从 ZIP 包创建索引（自动识别语言）')
  .option('--name <name>', '项目名称')
  .option('--force', '强制重新索引')
  .action(async (zipPath, options) => {
    const projectName = options.name || path.basename(zipPath, '.zip');
    const indexDir = path.join(getCodegraphHome(), 'indexes', projectName);
    const dbPath = path.join(indexDir, 'db');

    // 检查是否已存在
    if (fs.existsSync(dbPath) && !options.force) {
      console.log(`Index already exists for "${projectName}". Use --force to reindex.`);
      return;
    }

    // 清理旧索引
    if (fs.existsSync(indexDir)) {
      fs.rmSync(indexDir, { recursive: true });
    }

    console.log(`Extracting ZIP...`);
    const tempDir = path.join(indexDir, 'temp');

    try {
      // 解析 ZIP 路径（支持相对路径和绝对路径）
      const resolvedZipPath = path.resolve(zipPath);
      const zip = new AdmZip(resolvedZipPath);
      zip.extractAllTo(tempDir, true);
      console.log(`  ✓ Extracted to ${tempDir}`);
    } catch (e) {
      console.error(`Error extracting ZIP: ${e.message}`);
      return;
    }

    // 初始化存储
    console.log('Initializing storage...');
    const store = createStore(STORE_TYPE, path.join(dbPath, 'index.json'));
    await store.init();

    // 获取支持的文件扩展名
    const extensions = getSupportedExtensions();
    console.log(`Parsing files (languages: ${extensions.join(', ')})...`);
    
    let fileCount = 0;
    let symbolCount = 0;
    let callCount = 0;

    // 解析所有支持的文件
    for (const ext of extensions) {
      const files = findFiles(tempDir, ext);
      
      // 获取该扩展名对应的解析器
      let parser = createParserForFile(path.join('dummy', 'file' + ext));

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const relativePath = path.relative(tempDir, file);

        try {
          const result = parser.parse(relativePath, content);

          // 插入文件节点
          await store.insertFile({
            path: relativePath,
            hash: '',
            language: getLanguageName(ext)
          });

          // 插入符号
          for (const symbol of result.symbols) {
            await store.insertSymbol(symbol);
            await store.insertDefinesIn(symbol.name, symbol.class, symbol.file, relativePath);
          }

          // 插入调用关系
          for (const call of result.calls) {
            if (call.caller && call.callee) {
              await store.insertCall(
                call.caller,
                call.callerClass,
                call.callee,
                call.calleeClass,
                call.file,
                call.line
              );
            }
          }

          // 插入引用关系
          for (const ref of result.references) {
            await store.insertReference(ref.from, ref.to, ref.file);
          }

          fileCount++;
          symbolCount += result.symbols.length;
          callCount += result.calls.length;

          if (fileCount % PROGRESS_INTERVAL === 0) {
            console.log(`  ✓ ${fileCount} files parsed...`);
          }
        } catch (e) {
          console.error(`Error parsing ${file}: ${e.message}`);
        }
      }
    }

    // 清理临时文件
    fs.rmSync(tempDir, { recursive: true });

    // 保存索引
    await store.save();

    // 更新注册表
    updateRegistry(projectName, indexDir, {
      languages: extensions.map(ext => getLanguageName(ext)),
      files: fileCount,
      symbols: symbolCount,
      calls: callCount,
      indexedAt: new Date().toISOString()
    });

    console.log(`Building graph... done (${symbolCount} symbols, ${callCount} relationships)`);
    console.log(`Index saved to ${indexDir}`);

    store.close();
  });

// ============================================================================
// callers 命令
// ============================================================================
command
  .command('callers <symbol>')
  .description('查找调用者')
  .option('--class <class>', '类名')
  .option('--project <project>', '项目名称')
  .option('--depth <depth>', '查询深度（-1 表示无限）', String(DEFAULT_DEPTH))
  .option('--json', '输出 JSON')
  .action(async (symbol, options) => {
    const project = options.project || findDefaultProject();
    if (!project) {
      console.error('No project found. Please specify --project or run in a project directory.');
      return;
    }

    let store;
    try {
      store = await createStoreInstance(project);
    } catch (e) {
      console.error(e.message);
      return;
    }

    const depth = parseInt(options.depth, 10);
    const results = store.findCallers(symbol, options.class, depth);

    if (options.json) {
      console.log(JSON.stringify(formatResults('callers', options, results), null, 2));
    } else {
      printResults('callers', { ...options, symbol }, results);
    }

    store.close();
  });

// ============================================================================
// callees 命令
// ============================================================================
command
  .command('callees <symbol>')
  .description('查找被调用')
  .option('--class <class>', '类名')
  .option('--project <project>', '项目名称')
  .option('--depth <depth>', '查询深度（-1 表示无限）', String(DEFAULT_DEPTH))
  .option('--json', '输出 JSON')
  .action(async (symbol, options) => {
    const project = options.project || findDefaultProject();
    if (!project) {
      console.error('No project found.');
      return;
    }

    let store;
    try {
      store = await createStoreInstance(project);
    } catch (e) {
      console.error(e.message);
      return;
    }

    const depth = parseInt(options.depth, 10);
    const results = store.findCallees(symbol, options.class, depth);

    if (options.json) {
      console.log(JSON.stringify(formatResults('callees', options, results), null, 2));
    } else {
      printResults('callees', { ...options, symbol }, results);
    }

    store.close();
  });

// ============================================================================
// deps 命令
// ============================================================================
command
  .command('deps <target>')
  .description('查看依赖')
  .option('--class <class>', '类名')
  .option('--project <project>', '项目名称')
  .action(async (target, options) => {
    const project = options.project || findDefaultProject();
    if (!project) {
      console.error('No project found.');
      return;
    }

    let store;
    try {
      store = await createStoreInstance(project);
    } catch (e) {
      console.error(e.message);
      return;
    }

    const results = store.findDependencies(target, options.class);

    console.log(`\n${options.class ? options.class + ' ' : ''}${target} depends on:\n`);

    if (results.length === 0) {
      console.log('  No dependencies found.');
    } else {
      const deps = {};
      for (const r of results) {
        const className = r.class || 'Unknown';
        if (!deps[className]) deps[className] = [];
        deps[className].push(r.name);
      }

      const sortedClasses = Object.keys(deps).sort();
      for (const cls of sortedClasses) {
        console.log(`  ├─ ${cls}`);
        for (const method of deps[cls].slice(0, 5)) {
          console.log(`  │   └─ ${method}`);
        }
        if (deps[cls].length > 5) {
          console.log(`  │   └─ ... and ${deps[cls].length - 5} more`);
        }
      }
    }

    store.close();
  });

// ============================================================================
// impact 命令
// ============================================================================
command
  .command('impact <symbol>')
  .description('影响分析')
  .option('--class <class>', '类名')
  .option('--project <project>', '项目名称')
  .action(async (symbol, options) => {
    const project = options.project || findDefaultProject();
    if (!project) {
      console.error('No project found.');
      return;
    }

    let store;
    try {
      store = await createStoreInstance(project);
    } catch (e) {
      console.error(e.message);
      return;
    }

    const results = store.findImpact(symbol, options.class);

    console.log(`\nImpact Analysis for "${options.class ? options.class + '.' : ''}${symbol}":\n`);

    if (results.length === 0) {
      console.log('  No impact found.');
    } else {
      const direct = results.filter(r => r.depth === 1);
      const indirect = results.filter(r => r.depth > 1);

      console.log(`Direct Impact (${direct.length} files):`);
      for (const r of direct.slice(0, 10)) {
        console.log(`  - ${r.class}.${r.name}`);
      }
      if (direct.length > 10) {
        console.log(`  ... and ${direct.length - 10} more`);
      }

      console.log(`\nIndirect Impact (${indirect.length} files):`);
      for (const r of indirect.slice(0, 10)) {
        console.log(`  - ${r.class}.${r.name} (depth ${r.depth})`);
      }
      if (indirect.length > 10) {
        console.log(`  ... and ${indirect.length - 10} more`);
      }
    }

    store.close();
  });

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取 codegraph 主目录
 * 
 * 使用 constants 中配置的 CODEGRAPH_HOME，如果为空则使用用户主目录下的 .codegraph。
 * 
 * @returns {string} 主目录路径
 */
function getCodegraphHome() {
  const home = CODEGRAPH_HOME || path.join(require('os').homedir(), '.codegraph');
  const indexesDir = path.join(home, 'indexes');
  if (!fs.existsSync(indexesDir)) {
    fs.mkdirSync(indexesDir, { recursive: true });
  }
  return home;
}

/**
 * 递归查找指定扩展名的文件
 * 
 * 自动排除隐藏目录和 node_modules。
 * 
 * @param {string} dir - 搜索目录
 * @param {string} extension - 文件扩展名（如 '.java'）
 * @returns {Array<string>} 文件路径列表
 */
function findFiles(dir, extension) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // 跳过隐藏目录和特殊目录
      if (!item.startsWith('.') && item !== 'node_modules') {
        files.push(...findFiles(fullPath, extension));
      }
    } else if (item.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 更新项目注册表
 * 
 * 记录项目的索引信息，用于后续查询。
 * 
 * @private
 * @param {string} projectName - 项目名称
 * @param {string} indexDir - 索引目录
 * @param {Object} meta - 元数据
 */
function updateRegistry(projectName, indexDir, meta) {
  const registryPath = path.join(getCodegraphHome(), 'registry.json');
  let registry = { projects: {} };

  if (fs.existsSync(registryPath)) {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  }

  registry.projects[projectName] = {
    path: indexDir,
    ...meta
  };

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * 查找默认项目
 * 
 * 返回注册表中的第一个项目，用于省略 --project 参数时。
 * 
 * @returns {string|null} 项目名称，未找到返回 null
 */
function findDefaultProject() {
  const registryPath = path.join(getCodegraphHome(), 'registry.json');
  if (!fs.existsSync(registryPath)) return null;

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  const projects = Object.keys(registry.projects);
  return projects.length > 0 ? projects[0] : null;
}

// 导出命令
module.exports = command;

// 如果是直接运行
if (require.main === module) {
  command.parseAsync(process.argv).catch(console.error);
}

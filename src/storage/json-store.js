/**
 * JSON 文件存储实现
 * 
 * 使用内存索引加速查询，支持大小写模糊匹配。
 * 索引在加载时构建，查询时优先使用索引，找不到时尝试模糊匹配。
 * 
 * 继承自 Store 抽象基类，实现所有存储接口方法。
 * 
 * @module storage/json-store
 */

const fs = require('fs');
const path = require('path');
const Store = require('./Store');
const { DEFAULT_MAX_DEPTH, SEARCH_LIMIT } = require('../constants');

/**
 * JSON 存储类
 * 继承自 Store 抽象基类
 */
class JsonStore extends Store {
  /**
   * 创建存储实例
   * @param {string} dbPath - 数据库文件路径
   */
  constructor(dbPath) {
    super(dbPath);
    this.data = {
      symbols: [],
      calls: [],
      references: [],
      imports: [],
      files: []
    };
    // 内存索引
    this.symbolIndex = new Map();      // id -> symbol
    this.callerIndex = new Map();      // calleeId -> [calls]
    this.calleeIndex = new Map();      // callerId -> [calls]
  }

  /**
   * @override
   */
  async init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      this.data = JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'));
      this._buildIndexes();
    }
  }

  /**
   * 构建内存索引
   * @private
   */
  _buildIndexes() {
    this.symbolIndex.clear();
    this.callerIndex.clear();
    this.calleeIndex.clear();

    // 构建符号索引
    for (const symbol of this.data.symbols) {
      const id = this._makeId(symbol.class, symbol.name);
      this.symbolIndex.set(id, symbol);
    }

    // 构建调用关系索引
    for (const call of this.data.calls) {
      const callerId = this._makeId(call.callerClass, call.caller);
      const calleeId = this._makeId(call.calleeClass, call.callee);

      if (!this.callerIndex.has(calleeId)) {
        this.callerIndex.set(calleeId, []);
      }
      this.callerIndex.get(calleeId).push(call);

      if (!this.calleeIndex.has(callerId)) {
        this.calleeIndex.set(callerId, []);
      }
      this.calleeIndex.get(callerId).push(call);
    }
  }

  /**
   * 生成符号 ID
   * @protected
   * @param {string} className - 类名
   * @param {string} name - 符号名
   * @returns {string} 格式化的 ID
   */
  _makeId(className, name) {
    if (className) {
      return `${className}:${name}`;
    }
    return name;
  }

  /**
   * 模糊匹配符号（大小写不敏感）
   * @protected
   * @param {string} name - 符号名
   * @param {string} className - 类名
   * @returns {Object|null} 匹配的符号
   */
  _fuzzyMatchSymbol(name, className) {
    // 精确匹配
    const exactId = this._makeId(className, name);
    let symbol = this.symbolIndex.get(exactId);
    
    if (symbol || !className) return symbol;

    // 大小写模糊匹配
    const classNameLower = className.toLowerCase();
    for (const [, s] of this.symbolIndex) {
      if (s.name === name && s.class &&
          s.class.toLowerCase() === classNameLower) {
        return s;
      }
    }
    
    return null;
  }

  /**
   * @override
   */
  async insertSymbol(symbol) {
    const id = this._makeId(symbol.class, symbol.name);
    const existing = this.data.symbols.find(s =>
      s.name === symbol.name &&
      s.class === symbol.class &&
      s.file === symbol.file
    );

    if (!existing) {
      this.data.symbols.push({ ...symbol, id });
      this.symbolIndex.set(id, symbol);
    }
  }

  /**
   * @override
   */
  async insertFile(file) {
    const existing = this.data.files.find(f => f.path === file.path);
    if (!existing) {
      this.data.files.push(file);
    }
  }

  /**
   * @override
   */
  async insertCall(callerName, callerClass, calleeName, calleeClass, file, line) {
    const callerId = this._makeId(callerClass, callerName);
    const calleeId = this._makeId(calleeClass, calleeName);

    const call = {
      caller: callerName,
      callerClass,
      callerId,
      callee: calleeName,
      calleeClass,
      calleeId,
      file,
      line
    };

    this.data.calls.push(call);

    // 更新索引
    if (!this.callerIndex.has(calleeId)) {
      this.callerIndex.set(calleeId, []);
    }
    this.callerIndex.get(calleeId).push(call);

    if (!this.calleeIndex.has(callerId)) {
      this.calleeIndex.set(callerId, []);
    }
    this.calleeIndex.get(callerId).push(call);
  }

  /**
   * @override
   */
  async insertReference(fromName, toName, file) {
    this.data.references.push({ from: fromName, to: toName, file });
  }

  /**
   * @override
   */
  async insertDefinesIn(symbolName, symbolClass, symbolFile, filePath) {
    // JSON 方案中不需要单独存储这个关系
  }

  /**
   * @override
   */
  findCallers(symbolName, symbolClass, depth = 1) {
    const targetId = this._makeId(symbolClass, symbolName);
    const results = [];
    const visited = new Set();

    // 使用索引快速查找
    const calls = this.callerIndex.get(targetId) || [];
    for (const call of calls) {
      // 首先尝试精确匹配
      let symbol = this.symbolIndex.get(call.callerId);

      // 如果找不到，尝试模糊匹配
      if (!symbol && call.callerClass) {
        symbol = this._fuzzyMatchSymbol(call.caller, call.callerClass);
      }

      if (symbol && !visited.has(symbol.id)) {
        results.push({
          name: symbol.name,
          class: symbol.class,
          file: symbol.file,
          line: symbol.line,
          depth: 1
        });
        visited.add(symbol.id);
      }
    }

    // 多层递归（BFS）
    // depth < 0 时无限递归，直到没有更多调用者
    if (depth !== 0 && (depth < 0 || depth > 1)) {
      const queue = [...results];
      let currentDepth = 1;

      while (queue.length > 0 && (depth < 0 || currentDepth < depth)) {
        const nextDepthCallers = [];
        const queueLength = queue.length;

        for (let i = 0; i < queueLength; i++) {
          const caller = queue[i];
          const callerId = this._makeId(caller.class, caller.name);
          const deeperCalls = this.callerIndex.get(callerId) || [];

          for (const call of deeperCalls) {
            let symbol = this.symbolIndex.get(call.callerId);

            if (!symbol && call.callerClass) {
              symbol = this._fuzzyMatchSymbol(call.caller, call.callerClass);
            }

            if (symbol && !visited.has(symbol.id)) {
              nextDepthCallers.push({
                name: symbol.name,
                class: symbol.class,
                file: symbol.file,
                line: symbol.line,
                depth: currentDepth + 1
              });
              visited.add(symbol.id);
            }
          }
        }

        results.push(...nextDepthCallers);
        queue.length = 0;
        queue.push(...nextDepthCallers);
        currentDepth++;
      }
    }

    return results;
  }

  /**
   * @override
   */
  findCallees(symbolName, symbolClass, depth = 1) {
    const sourceId = this._makeId(symbolClass, symbolName);
    const results = [];
    const visited = new Set();

    // 使用索引快速查找
    const calls = this.calleeIndex.get(sourceId) || [];
    for (const call of calls) {
      // 首先尝试精确匹配
      let symbol = this.symbolIndex.get(call.calleeId);

      // 如果找不到，尝试模糊匹配
      if (!symbol && call.calleeClass) {
        symbol = this._fuzzyMatchSymbol(call.callee, call.calleeClass);
      }

      if (symbol && !visited.has(symbol.id)) {
        results.push({
          name: symbol.name,
          class: symbol.class,
          file: symbol.file,
          line: symbol.line,
          depth: 1
        });
        visited.add(symbol.id);
      }
    }

    // 多层递归（BFS）
    // depth < 0 时无限递归，直到没有更多被调用
    if (depth !== 0 && (depth < 0 || depth > 1)) {
      const queue = [...results];
      let currentDepth = 1;

      while (queue.length > 0 && (depth < 0 || currentDepth < depth)) {
        const nextDepthCallees = [];
        const queueLength = queue.length;

        for (let i = 0; i < queueLength; i++) {
          const callee = queue[i];
          const calleeId = this._makeId(callee.class, callee.name);
          const deeperCalls = this.calleeIndex.get(calleeId) || [];

          for (const call of deeperCalls) {
            let symbol = this.symbolIndex.get(call.calleeId);

            if (!symbol && call.calleeClass) {
              symbol = this._fuzzyMatchSymbol(call.callee, call.calleeClass);
            }

            if (symbol && !visited.has(symbol.id)) {
              nextDepthCallees.push({
                name: symbol.name,
                class: symbol.class,
                file: symbol.file,
                line: symbol.line,
                depth: currentDepth + 1
              });
              visited.add(symbol.id);
            }
          }
        }

        results.push(...nextDepthCallees);
        queue.length = 0;
        queue.push(...nextDepthCallees);
        currentDepth++;
      }
    }

    return results;
  }

  /**
   * @override
   */
  findDependencies(symbolName, symbolClass) {
    const sourceId = this._makeId(symbolClass, symbolName);
    const seen = new Set();
    const results = [];

    // 如果只提供了类名，查找该类所有方法的依赖
    if (!symbolClass && symbolName) {
      const methods = this.data.symbols.filter(s => 
        s.class === symbolName && s.type === 'method'
      );
      
      for (const method of methods) {
        const methodId = `${method.class}:${method.name}`;
        const calls = this.calleeIndex.get(methodId) || [];

        for (const call of calls) {
          if (!seen.has(call.calleeId)) {
            let symbol = this.symbolIndex.get(call.calleeId);

            if (!symbol && call.calleeClass) {
              symbol = this._fuzzyMatchSymbol(call.callee, call.calleeClass);
            }

            if (symbol && !seen.has(symbol.id)) {
              results.push({
                name: symbol.name,
                class: symbol.class,
                file: symbol.file
              });
              seen.add(symbol.id);
            }
          }
        }
      }
    } else {
      // 查询特定符号
      const calls = this.calleeIndex.get(sourceId) || [];

      for (const call of calls) {
        if (!seen.has(call.calleeId)) {
          let symbol = this.symbolIndex.get(call.calleeId);

          if (!symbol && call.calleeClass) {
            symbol = this._fuzzyMatchSymbol(call.callee, call.calleeClass);
          }

          if (symbol && !seen.has(symbol.id)) {
            results.push({
              name: symbol.name,
              class: symbol.class,
              file: symbol.file
            });
            seen.add(symbol.id);
          }
        }
      }
    }

    // 添加 REFERENCES 关系
    for (const ref of this.data.references) {
      if (ref.from === symbolName || ref.from === sourceId) {
        const symbol = this.data.symbols.find(s => s.name === ref.to);
        if (symbol && !seen.has(this._makeId(symbol.class, symbol.name))) {
          results.push({
            name: symbol.name,
            class: symbol.class,
            file: symbol.file
          });
          seen.add(this._makeId(symbol.class, symbol.name));
        }
      }
    }

    return results;
  }

  /**
   * @override
   */
  findImpact(symbolName, symbolClass, maxDepth = DEFAULT_MAX_DEPTH) {
    const targetId = this._makeId(symbolClass, symbolName);
    const results = [];
    const visited = new Set();

    // BFS 查找所有受影响节点
    const queue = [];

    // 首先尝试精确匹配
    let calls = this.callerIndex.get(targetId) || [];

    // 如果找不到，尝试模糊匹配（大小写不敏感）
    if (calls.length === 0 && symbolClass) {
      const targetLower = targetId.toLowerCase();
      for (const [key, value] of this.callerIndex) {
        const keyLower = key.toLowerCase();
        if (keyLower === targetLower || 
            keyLower.startsWith(targetLower + ':') || 
            keyLower.endsWith(':' + targetId)) {
          calls = value;
          break;
        }
      }
    }

    for (const call of calls) {
      // 查找调用者符号
      let symbol = this.symbolIndex.get(call.callerId);

      if (!symbol && call.callerClass) {
        symbol = this._fuzzyMatchSymbol(call.caller, call.callerClass);
      }

      if (symbol && !visited.has(symbol.id)) {
        queue.push({ ...symbol, depth: 1 });
        visited.add(symbol.id);
      }
    }

    // maxDepth < 0 时无限递归，直到没有更多调用者
    const maxDepthValue = maxDepth < 0 ? Infinity : maxDepth;
    
    while (queue.length > 0 && queue[0].depth <= maxDepthValue) {
      const current = queue.shift();
      results.push(current);

      if (current.depth < maxDepthValue) {
        const currentId = this._makeId(current.class, current.name);
        let deeperCalls = this.callerIndex.get(currentId) || [];

        // 如果找不到，尝试模糊匹配
        if (deeperCalls.length === 0 && current.class) {
          const currentLower = currentId.toLowerCase();
          for (const [key, value] of this.callerIndex) {
            const keyLower = key.toLowerCase();
            if (keyLower === currentLower || 
                keyLower.startsWith(currentLower + ':') || 
                keyLower.endsWith(':' + currentId)) {
              deeperCalls = value;
              break;
            }
          }
        }

        for (const call of deeperCalls) {
          let symbol = this.symbolIndex.get(call.callerId);

          if (!symbol && call.callerClass) {
            symbol = this._fuzzyMatchSymbol(call.caller, call.callerClass);
          }

          if (symbol && !visited.has(symbol.id)) {
            queue.push({
              name: symbol.name,
              class: symbol.class,
              file: symbol.file,
              line: symbol.line,
              depth: current.depth + 1
            });
            visited.add(symbol.id);
          }
        }
      }
    }

    // 按深度排序
    results.sort((a, b) => a.depth - b.depth);
    return results;
  }

  /**
   * @override
   */
  searchSymbols(query, type) {
    const results = this.data.symbols
      .filter(s => {
        if (type && s.type !== type) return false;
        return s.name.includes(query);
      })
      .map(s => ({
        name: s.name,
        class: s.class,
        type: s.type,
        file: s.file,
        line: s.line
      }));
    
    // SEARCH_LIMIT = -1 时返回全部，否则限制数量
    return SEARCH_LIMIT < 0 ? results : results.slice(0, SEARCH_LIMIT);
  }

  /**
   * @override
   */
  getStats() {
    return {
      symbols: this.data.symbols.length,
      calls: this.data.calls.length,
      files: this.data.files.length
    };
  }

  /**
   * @override
   */
  async save() {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
  }

  /**
   * @override
   */
  close() {
    // JSON 方案无需特殊处理
  }
}

module.exports = JsonStore;

// 文件名: jsonStreamExample.js

const { Readable } = require('stream');

// 1. 模拟 JSON 流生成器
// 模拟分块发送的 JSON 数据流
function createJsonStream() {
  // 修改为有效的JSON数据格式，每个对象单独发送
  const data = [
    '{"id":1,"name":"Alice"}',
    '{"id":2,"name":"Bob"}',
    '{"id":3,"name":"Charlie"}'
  ];

  // 模拟分块发送数据
  const readable = new Readable({
    read() {
      for (let i = 0; i < data.length; i++) {
        // 模拟分块发送，如从网络或文件中读取
        this.push(data[i]);
        // setTimeout是无效的，因为它不会暂停流的读取
      }
      this.push(null); // 结束流
    }
  });

  return readable;
}

// 2. 自定义 JSON 解析器
// 用于逐块解析 JSON 数据流，返回 JSON 对象流
async function* parseJsonStream(input) {
  let buffer = "";
  for await (const chunk of input) {
    // 将Buffer转换为字符串
    const chunkStr = chunk.toString('utf-8');
    buffer += chunkStr;
    
    try {
      // 尝试分割多个JSON对象 - 使用正则表达式匹配完整的JSON对象
      const jsonRegex = /{[^{}]*(?:{[^{}]*})*[^{}]*}/g;
      const matches = buffer.match(jsonRegex);
      
      if (matches) {
        for (const jsonStr of matches) {
          try {
            const parsed = JSON.parse(jsonStr);
            yield parsed;
            // 从buffer中移除已处理的JSON
            buffer = buffer.replace(jsonStr, '');
          } catch (parseErr) {
            console.error("单个JSON解析错误:", parseErr.message);
          }
        }
      }
    } catch (e) {
      console.error("解析错误:", e.message);
    }
  }
  
  // 处理缓冲区中可能剩余的内容
  if (buffer.trim()) {
    try {
      const jsonRegex = /{[^{}]*(?:{[^{}]*})*[^{}]*}/g;
      const matches = buffer.match(jsonRegex);
      
      if (matches) {
        for (const jsonStr of matches) {
          try {
            const parsed = JSON.parse(jsonStr);
            yield parsed;
          } catch (parseErr) {
            console.error("剩余JSON解析错误:", parseErr.message);
          }
        }
      }
    } catch (e) {
      console.error("剩余内容解析失败:", e.message);
    }
  }
}

// 3. 处理链：对每个 JSON 对象进行处理
async function* processJsonStream(input) {
  for await (const item of input) {
    // 添加处理逻辑（例如添加字段）
    const processed = {
      ...item,
      status: 'processed',
      timestamp: new Date().toISOString()
    };
    yield processed;
  }
}

// 流式打印函数 - 打字机效果
async function streamPrint(text, delay = 30) {
  for (const char of text) {
    process.stdout.write(char);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  process.stdout.write('\n');
}

// 模拟进度条
async function progressBar(message, duration = 1000) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const startTime = Date.now();
  const endTime = startTime + duration;
  
  let i = 0;
  
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const currentTime = Date.now();
      if (currentTime >= endTime) {
        clearInterval(interval);
        process.stdout.write('\r\x1b[K'); // 清除当前行
        resolve();
        return;
      }
      
      const frame = frames[i % frames.length];
      process.stdout.write(`\r${frame} ${message}`);
      i++;
    }, 80);
  });
}

// 4. 主函数：连接流并测试
async function main() {
  // 打印标题
  console.log('\x1b[35m%s\x1b[0m', '🚀 JSON流处理与流式输出演示'); // 紫色标题
  console.log('\x1b[90m%s\x1b[0m', '==================================='); // 灰色分隔线
  
  // 显示初始化进度
  await progressBar('初始化数据流...', 800);
  
  const rawJsonStream = createJsonStream(); // 生成原始 JSON 流
  console.log('\x1b[32m%s\x1b[0m', '✓ 数据流已创建'); // 绿色成功标记
  
  await progressBar('解析JSON数据...', 800);
  const parsedStream = parseJsonStream(rawJsonStream); // 解析 JSON 流
  console.log('\x1b[32m%s\x1b[0m', '✓ 解析器已准备'); // 绿色成功标记
  
  await progressBar('设置处理管道...', 800);
  const processedStream = processJsonStream(parsedStream); // 处理 JSON 流
  console.log('\x1b[32m%s\x1b[0m', '✓ 处理管道已就绪'); // 绿色成功标记
  
  console.log('\n\x1b[36m%s\x1b[0m', '=== 开始处理JSON流 ==='); // 青色文字
  
  let count = 0;
  for await (const result of processedStream) {
    count++;
    await progressBar(`处理第 ${count} 个JSON对象...`, 500);
    
    const jsonStr = JSON.stringify(result, null, 2);
    
    // 打印带颜色的标题和边框
    console.log('\x1b[33m%s\x1b[0m', `┌─── 处理结果 #${count} ───┐`); // 黄色标题
    
    // 流式打印JSON内容
    await streamPrint(jsonStr);
    
    // 打印底部边框
    console.log('\x1b[33m%s\x1b[0m', `└${'─'.repeat(20)}┘`); // 黄色底框
    
    if (count < 3) { // 因为我们知道只有3个测试数据
      await new Promise(resolve => setTimeout(resolve, 300)); // 短暂暂停
    }
  }
  
  console.log('\n\x1b[36m%s\x1b[0m', '=== 所有JSON对象处理完成 ===');
  console.log('\x1b[90m%s\x1b[0m', `共处理了 ${count} 个JSON对象`);
}

// 运行主函数
main().catch(console.error);

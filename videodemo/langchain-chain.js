/**
 * 
输入: { animal: "bear" }
↓
ChatPromptTemplate → 生成提示: "Write a comma-separated list of 5 animals similar to: bear"
↓
模型 → 生成输出（流式，如 "bear, panda, ...")
↓
StringOutputParser → 将输出转换为字符串流
↓
splitIntoList → 按逗号分割为独立项（如 ["bear"], ["panda"], ...）
↓
最终输出: 逐项打印到控制台


langchain中链间的流式输出：https://js.langchain.com/docs/how_to/functions
   1. 主要利用RunnableSequence来强制转化自定义函数为Runnables对象
 * 
 */

// 导入必要的模块（假设已预先导入）
const { ChatPromptTemplate } = require("langchain/prompts");
const { StringOutputParser } = require("langchain/schema/output_parser");
const { model } = require("./your-model-config"); // 替换为实际模型配置

// 1. 定义提示模板
// 生成一个提示，要求模型输出与指定动物相似的5种动物，用逗号分隔
const streamingPrompt = ChatPromptTemplate.fromTemplate(
    "Write a comma-separated list of 5 animals similar to: {animal}. Do not include numbers"
  );
  
  // 2. 构建链式处理流程
  // 将提示模板、模型和字符串解析器串联成一个处理链
  // - 提示模板生成提示
  // - 模型处理提示并生成响应
  // - 字符串解析器将模型输出转换为字符串流
  const strChain = streamingPrompt.pipe(model).pipe(new StringOutputParser());
  
  // 4. 自定义解析器：按逗号分割输出
  // 将模型输出的字符串流按逗号分割为独立项
  async function* splitIntoList(input) {
    let buffer = ""; // 缓存未处理的字符串
    for await (const chunk of input) {
      buffer += chunk; // 将当前块追加到缓冲区
      while (buffer.includes(",")) {
        const commaIndex = buffer.indexOf(","); // 查找第一个逗号位置
        yield [buffer.slice(0, commaIndex).trim()]; // 分割出第一个项并返回
        buffer = buffer.slice(commaIndex + 1); // 更新缓冲区为剩余内容
      }
    }
    yield [buffer.trim()]; // 处理缓冲区中的最后一项
  }
  
  // 5. 将自定义解析器接入链式流程
  // 将 splitIntoList 解析器作为最后一个步骤接入链式流程
  const listChain = strChain.pipe(splitIntoList);
  
  // 6. 执行流式处理并输出结果
  // 启动链式流程的流式处理，传入参数 { animal: "bear" }
  const listChainStream = await listChain.stream({ animal: "bear" });
  
  // 使用 for await...of 循环逐个处理分割后的结果
  // 每个结果是一个包含单个动物的数组
  for await (const chunk of listChainStream) {
    console.log(chunk);
  }


/**
 * 大模型给的版本2：RunnableFunction实际不存在但思路差不多
 * 
 * 当使用 RunnableSequence.from 静态方法在链中使用自定义函数时，你可以省略显式创建和依赖强制
 * 下方的RunnableSequence直接用RunnableFunction来代替RunnableSequence.from
 */


  import { ChatPromptTemplate } from "@langchain/core/prompts";
  import { StringOutputParser, RunnableFunction, RunnableSequence } from "@langchain/core/runnables";
  import { ChatOpenAI } from "@langchain/openai";
  
  // 1. 大模型生成 HTML 链
  const model = new ChatOpenAI({ temperature: 0.7 });
  
  const htmlPrompt = ChatPromptTemplate.fromTemplate(
    "Generate an HTML page with a <style> tag containing CSS for a {theme} theme."
  );
  
  const htmlChain = htmlPrompt.pipe(model).pipe(new StringOutputParser());
  
  // 2. 自定义 CSS 转换链
  const cssTransformer = new RunnableFunction({
    func: async function* (input) {
      let buffer = "";
      for await (const chunk of input) {
        buffer += chunk;
  
        const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
        let match;
        while ((match = styleRegex.exec(buffer)) !== null) {
          const rawCSS = match[1];
          const transformedCSS = rawCSS
            .replace(/color:/g, "background-color:")
            .toUpperCase();
  
          buffer = buffer.replace(rawCSS, transformedCSS);
        }
  
        yield buffer;
        buffer = "";
      }
    },
  });
  
  // 3. 流式输出链
  const finalChain = new RunnableFunction({
    func: async function* (input) {
      for await (const chunk of input) {
        yield chunk;
      }
    },
  });
  
  // 4. 组合完整链
  const fullChain = RunnableSequence.from([
    htmlChain,
    cssTransformer,
    finalChain,
  ]);
  
  // 5. 执行流式调用
  const stream = await fullChain.stream({ theme: "dark" });
  
  for await (const chunk of stream) {
    console.log(chunk);
  }
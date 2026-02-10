<template>
  <div class="text-editor-page">
    <BlogEditor v-model="markdownContent" class="full-height-editor" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BlogEditor from '../components/BlogEditor.vue'

const markdownContent = ref(`# 欢迎使用 Chronicle Sonetto

这是一个简单的 Markdown 编辑器，支持代码块、表格、段落自动识别。

## JavaScript 代码块

\`\`\`javascript
function hello(name) {
  console.log("Hello, " + name + "!");
  return "欢迎使用 Chronicle!";
}

hello("World");
\`\`\`

使用三个反引号 \`\`\` 来创建代码块，支持多种编程语言的语法高亮！

## 这是一个表格：

| Row1 | Row2 | Row3 |
| --- | --- | --- |
| John Doe | Zhang San | 胡彦斌 |
| 1 | 2.00 | 3 |

## 这是一个长段落

红军不怕远征难\\
万水千山只等闲
五岭逶迤腾细浪\\
乌蒙磅礴走泥丸\\1
金沙水拍云崖暖\\
大渡桥横铁索寒\\\\
更喜岷山千里雪
三军过后尽开颜\\

## 这是一个引用块

> 引用内容
> 1
> 1. 引用内容
> 3. 引用内容
> \`this is code\`

这是\*\*粗体\*\*

这是\*斜体\*

这是\*\*\*粗斜体\*\*\*

这是\`行内代码mono code\`

## 这是一个列表

1. 姓名：kun
2. 爱好
    - 唱
    - 跳
    - rap
    - 篮球
    - music
25. 所属：美国校队

#### 这是野兽先辈

* 114
    * 514
        * 1919
            * 810

### 这是数学公式

#### 这是用\\$\\$包裹的公式
$$
e^x=\\sum_{n=0}^{\\infty} \\frac{x^n}{n!}
$$

\\$\\$这部分不会显示为公式\\$\\$

#### 这是用\\\\[和\\\\]包裹的公式
\\[
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
\\]

\\\\[这部分也不会显示为公式\\\\]

这是行内公式1：\\(E = mc^2\\)

这是行内公式2：$L(x,\\lambda) = f(x) + \\lambda h(x)$

`)
</script>

<style scoped>
.text-editor-page {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}
.full-height-editor {
  height:100%;
  flex: 1;
  overflow: hidden;
}
</style>

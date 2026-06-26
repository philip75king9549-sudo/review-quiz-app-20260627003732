import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnswerFreeCopy,
  gradeChapter,
  parseReviewMaterial,
} from "./questionParser.js";

const sample = `
第一章 基础知识
1. 计算机的核心部件是（ ）
A. 显示器
B. 中央处理器
C. 键盘
D. 鼠标
答案：B

2. RAM 断电后数据不会丢失。（×）

第二章 网络
1. HTTP 是应用层协议。
答案：正确
2. 以下属于浏览器的是（ ）
A. Chrome B. Excel C. Safari D. Photoshop
答案：AC
`;

test("识别章节、选择题、判断题和多选题", () => {
  const result = parseReviewMaterial(sample, "sample.txt");
  assert.equal(result.stats.chapterCount, 2);
  assert.equal(result.stats.questionCount, 4);
  assert.equal(result.stats.choiceCount, 2);
  assert.equal(result.stats.judgeCount, 2);
  assert.equal(result.sourceText.includes("答案：B"), true);
  assert.equal(result.questions[0].answer, "B");
  assert.equal(result.questions[1].answer, "F");
  assert.equal(result.questions[3].multiple, true);
});

test("导出的副本不包含答案", () => {
  const result = parseReviewMaterial(sample);
  const copy = createAnswerFreeCopy(result);
  assert.equal(copy.includes("答案：B"), false);
  assert.equal(copy.includes("（×）"), false);
  assert.equal(copy.includes("中央处理器"), true);
});

test("按标准答案批改", () => {
  const result = parseReviewMaterial(sample);
  const chapterQuestions = result.questions.filter(
    (question) => question.chapterId === result.chapters[0].id,
  );
  const grade = gradeChapter(chapterQuestions, {
    [chapterQuestions[0].id]: "B",
    [chapterQuestions[1].id]: "T",
  });
  assert.equal(grade.correct, 1);
  assert.equal(grade.score, 50);
});

test("识别中文括号题号", () => {
  const result = parseReviewMaterial(`
第一单元
（1）地球围绕太阳公转。
答案：正确
`);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].type, "judge");
});

test("识别题干括号内答案和无编号判断题", () => {
  const result = parseReviewMaterial(`
第一章 测试章节
一、单项选择题
1.中国特色社会主义道路是（ A）。
A.实现途径 B.行动指南 C.根本保障 D.精神力量
二、多项选择题
1.正确选项有（ ABC ）。
A.甲 B.乙 C.丙 D.丁
三、判断题
这是第一道判断题。（√）
这是第二道判断题。（×）
`);

  assert.equal(result.questions.length, 4);
  assert.equal(result.questions[0].answer, "A");
  assert.equal(result.questions[0].stem.includes("A"), false);
  assert.equal(result.questions[1].answer, "ABC");
  assert.equal(result.questions[2].answer, "T");
  assert.equal(result.questions[3].answer, "F");
});

test("兼容 V 和 X 判断题标记", () => {
  const result = parseReviewMaterial(`
第一章
判断题
1.第一道题。（V）
2.第二道题。（X）
`);
  assert.equal(result.questions[0].answer, "T");
  assert.equal(result.questions[1].answer, "F");
});

test("拆分 Word 中挤在同一段的连续题目", () => {
  const result = parseReviewMaterial(`
第一章
单选题
1.第一题（A）。A.甲 B.乙 C.丙 D.丁2.第二题（B）。A.甲 B.乙 C.丙 D.丁
判断题
1.第一道判断。（√）2.第二道判断。（×）
`);
  assert.equal(result.questions.length, 4);
  assert.deepEqual(
    result.questions.map((question) => question.answer),
    ["A", "B", "T", "F"],
  );
});

test("题型服从栏目并补全缺失的 A 选项标记", () => {
  const result = parseReviewMaterial(`
第一章
多选题
1.三农包括（ ABC ）。
农业 B.农村 C.农民 D.农民工
判断题
1.这是判断题。（√）
`);
  assert.equal(result.questions[0].type, "choice");
  assert.equal(result.questions[0].multiple, true);
  assert.deepEqual(
    result.questions[0].options.map((option) => option.key),
    ["A", "B", "C", "D"],
  );
  assert.equal(result.questions[0].options[0].text, "农业");
  assert.equal(result.questions[1].type, "judge");
});

test("识别无题号且答案另起一行的判断题", () => {
  const result = parseReviewMaterial(`
第一章
判断题
第一道判断题。
答案：正确
第二道判断题。
答案：错误
`);
  assert.equal(result.questions.length, 2);
  assert.deepEqual(
    result.questions.map((question) => question.answer),
    ["T", "F"],
  );
});

test("章节统计选择题和判断题数量", () => {
  const result = parseReviewMaterial(`
第一章
单选题
1.选择题（A）。
A.甲 B.乙
判断题
1.判断题。（√）
`);
  assert.equal(result.chapters[0].choiceCount, 1);
  assert.equal(result.chapters[0].judgeCount, 1);
});

test("识别填空题和论述题，并保留主观题参考答案", () => {
  const result = parseReviewMaterial(`
第一章 新题型
填空题
1. 中国特色社会主义最本质的特征是____。
答案：中国共产党领导

论述题
1. 简述新时代坚持和发展中国特色社会主义的基本方略。
答案：
坚持党的领导。
坚持以人民为中心。
坚持全面深化改革。
`);

  assert.equal(result.stats.questionCount, 2);
  assert.equal(result.stats.fillCount, 1);
  assert.equal(result.stats.essayCount, 1);
  assert.equal(result.questions[0].type, "fill");
  assert.equal(result.questions[0].answer, "中国共产党领导");
  assert.equal(result.questions[1].type, "essay");
  assert.match(result.questions[1].answer, /坚持党的领导/);

  const grade = gradeChapter(result.questions, {
    [result.questions[0].id]: "中国共产党领导",
  });
  assert.equal(grade.total, 1);
  assert.equal(grade.correct, 1);
  assert.equal(grade.score, 100);
});

test("论述题答案中的编号要点不会被误识别成新题", () => {
  const result = parseReviewMaterial(`
第一章
论述题
1. 简述基本方略。
答案：
1. 坚持党的领导。
2. 坚持以人民为中心。
3. 坚持全面深化改革。
`);

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].type, "essay");
  assert.match(result.questions[0].answer, /坚持以人民为中心/);
});

test("集中在最后的主观题会单独归入主观资料", () => {
  const result = parseReviewMaterial(`
第一章
单选题
1. 选择题（A）。
A.甲 B.乙
第二章
单选题
1. 选择题（B）。
A.甲 B.乙
第三章
论述题
1. 简述原因。
答案：原因很多。
`);

  assert.equal(result.chapters.at(-1).title, "主观资料");
  assert.equal(result.questions.find((question) => question.type === "essay").chapterTitle, "主观资料");
});

test("纯资料会作为资料阅读导入", () => {
  const result = parseReviewMaterial(`
这是第一段复习资料，介绍课程背景和核心概念。
这里没有题号和答案，但仍然应该保留给用户阅读复习。
`);

  assert.equal(result.stats.noteCount, 1);
  assert.equal(result.questions[0].type, "note");
  assert.equal(result.chapters[0].title, "资料阅读");
});

test("题目和纯资料混在一起时都能保留", () => {
  const result = parseReviewMaterial(`
第一章
单选题
1. 选择题（A）。
A.甲 B.乙
答案：A
这一段是课本补充资料，用于解释本章背景，不是题目但也要保留。
后续还有一段复习提示，应该进入资料阅读而不是粘到上一道题。
判断题
1. 判断题。（√）
`);

  assert.equal(result.stats.choiceCount, 1);
  assert.equal(result.stats.judgeCount, 1);
  assert.equal(result.stats.noteCount, 1);
  assert.equal(result.questions.some((question) => question.type === "note" && question.answer.includes("课本补充资料")), true);
});

test("识别夹在空格里的填空答案", () => {
  const result = parseReviewMaterial(`
填空：
1.     画像石   是雕刻着不同画面，用于构筑墓室的建筑石材。
2.法国浪漫主义画家     籍里科    的《美杜莎之筏》取材于真实事件。
现存最早独立青绿山水卷轴画作品名为    《游春图》   。
`);

  assert.equal(result.stats.fillCount, 3);
  assert.deepEqual(
    result.questions.filter((question) => question.type === "fill").map((question) => question.answer),
    ["画像石", "籍里科", "《游春图》"],
  );
  assert.equal(result.questions[0].stem.includes("画像石"), false);
});

test("材料分析题按大题整合为主观资料", () => {
  const result = parseReviewMaterial(`
材料分析：
1.根据以下材料，请回答：
材料一：这是第一段材料。
摘自《资料一》
材料二：这是第二段材料。
（1）第一问是什么？
参考答案要点：
①第一问答案。
（2）第二问是什么？
参考答案要点：
②第二问答案。
2.根据以下材料，请回答：
材料一：另一段材料。
（1）第三问是什么？
参考答案要点：
③第三问答案。
论述：
1.如何理解这个问题？
（1）第一点。
（2）第二点。
`);

  const essays = result.questions.filter((question) => question.type === "essay");
  assert.equal(essays.length, 3);
  assert.equal(essays[0].answer.includes("（2）第二问是什么？"), true);
  assert.equal(essays[2].answer.includes("（2）第二点。"), true);
});

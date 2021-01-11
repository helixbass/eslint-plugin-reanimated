import { ESLintUtils, TSESTree } from "@typescript-eslint/experimental-utils";
import {
  isFunctionDeclaration,
  isBlock,
  isExpressionStatement,
  CallExpression,
  isFunctionTypeNode,
  getJSDocTags,
  isArrowFunction,
  isMethodSignature,
  isModuleBlock,
  isInterfaceDeclaration,
} from "typescript";
export type Options = [];
export type MessageIds = "JSFunctionInWorkletMessage";

const createRule = ESLintUtils.RuleCreator((name) => {
  console.log({ name });
  return `https://github.com/wcandillon/eslint-plugin-reanimated/blob/master/rules/${name}.md`;
});

const functionHooks = new Map([
  ["useAnimatedStyle", [0]],
  ["useAnimatedProps", [0]],
  ["useDerivedValue", [0]],
  ["useAnimatedScrollHandler", [0]],
  ["useAnimatedReaction", [0, 1]],
  ["useWorkletCallback", [0]],
  ["createWorklet", [0]],
  // animations' callbacks
  ["withTiming", [2]],
  ["withSpring", [2]],
  ["withDecay", [1]],
  ["withRepeat", [3]],
]);
const builtInFunctions = [
  "Array",
  "ArrayConstructor",
  "Date",
  "DateConstructor",
  "Function",
  "Math",
  "NumberConstructor",
  "ObjectConstructor",
  "ReadonlyArray",
  "RegExp",
  "RegExpConstructor",
  "String",
  "StringConstructor",
];
const functionNames = Array.from(functionHooks.keys());
const matchFunctions = `/${functionNames.join("|")}/`;

const JSFunctionInWorkletMessage =
  "{{name}} is not a worklet. Use runOnJS instead.";

export default createRule<Options, MessageIds>({
  name: "js-function-in-worklet",
  meta: {
    type: "problem",
    docs: {
      description:
        "non-worklet functions should be invoked via runOnJS. Use runOnJS() or workletlize instead.",
      category: "Possible Errors",
      recommended: "error",
    },
    fixable: "code",
    schema: [],
    messages: {
      JSFunctionInWorkletMessage,
    },
  },
  defaultOptions: [],
  create: (context) => {
    // const sourceCode = context.getSourceCode();
    const parserServices = ESLintUtils.getParserServices(context);
    const checker = parserServices.program.getTypeChecker();
    // const compilerOptions = parserServices.program.getCompilerOptions();
    const calleeIsWorklet = (tsNode: CallExpression) => {
      const signature = checker.getResolvedSignature(tsNode);
      const decl = signature?.declaration;
      if (decl !== undefined && isFunctionTypeNode(decl)) {
        //const r = checker.getResolvedSignature(tsNode.parent.ki);
        const { parent } = decl;
        if (
          isFunctionDeclaration(parent) &&
          parent.name?.getText() === "createWorklet"
        ) {
          return true;
        }
        const tags = getJSDocTags(decl);
        return (
          tags.filter((tag) => tag.tagName.getText() === "worklet").length > 0
        );
      } else if (
        decl !== undefined &&
        (isFunctionDeclaration(decl) || isArrowFunction(decl))
      ) {
        if (decl.body && isBlock(decl.body)) {
          const [statement] = decl.body.statements;
          if (statement && isExpressionStatement(statement)) {
            const esNode = parserServices.tsNodeToESTreeNodeMap.get<TSESTree.ExpressionStatement>(
              statement
            );
            return esNode.directive === "worklet";
          }
        }
      }
      return false;
    };
    let currentCodePath: string | null = null;
    let callerIsWorklet = false;
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onCodePathStart: (...args: any[]) => {
        const [codePath, node] = args;
        if (
          (node.type === "ArrowFunctionExpression" ||
            node.type === "FunctionDeclaration") &&
          node.body.type === "BlockStatement" &&
          node.body.body.length > 0 &&
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (node.body.body as any[])[0]?.directive === "worklet"
        ) {
          currentCodePath = codePath.id;
          callerIsWorklet = true;
        }
      },
      onCodePathEnd: (codePath: { id: string }) => {
        if (codePath.id === currentCodePath) {
          currentCodePath = null;
          callerIsWorklet = false;
        }
      },
      ["CallExpression[callee.name='useAnimatedGestureHandler'] > ObjectExpression"]: () => {
        callerIsWorklet = true;
      },
      ["CallExpression[callee.name='useAnimatedGestureHandler'] > ObjectExpression:exit"]: () => {
        callerIsWorklet = false;
      },
      [`CallExpression[callee.name=${matchFunctions}] > ArrowFunctionExpression`]: () => {
        callerIsWorklet = true;
      },
      [`CallExpression[callee.name=${matchFunctions}] > ArrowFunctionExpression:exit`]: () => {
        callerIsWorklet = false;
      },
      CallExpression: (node) => {
        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
        const { expression } = tsNode;
        const name = expression.getText();
        const signature = checker.getResolvedSignature(tsNode);
        const declaration = signature?.declaration;
        if (
          declaration &&
          isMethodSignature(declaration) &&
          isInterfaceDeclaration(declaration.parent) &&
          builtInFunctions.indexOf(declaration.parent.name.getText()) !== -1
        ) {
          return;
        } else if (
          declaration &&
          isFunctionDeclaration(declaration) &&
          isModuleBlock(declaration.parent) &&
          declaration.parent.parent.name.getText() === "Animated"
        ) {
          return;
        }

        if (callerIsWorklet) {
          if (!calleeIsWorklet(tsNode)) {
            context.report({
              messageId: "JSFunctionInWorkletMessage",
              node,
              data: {
                name,
              },
            });
          }
        }
      },
    };
  },
});

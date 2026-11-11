import { ActionNode, ConditionNode, MessageNode, StartFlowNode, StartNode, UserInputNode } from "./FlowNodes";

/** Registro de nodos para React Flow (definido fuera del componente para no recrearse en cada render). */
export const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  user_input: UserInputNode,
  action: ActionNode,
  condition: ConditionNode,
  start_flow: StartFlowNode,
};

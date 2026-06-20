import nextVitals from "eslint-config-next/core-web-vitals";

export default nextVitals.map((block) => {
  if (!block.rules?.['react-hooks/set-state-in-effect']) return block;
  return {
    ...block,
    rules: {
      ...block.rules,
      'react-hooks/set-state-in-effect': 'off',
    },
  };
});

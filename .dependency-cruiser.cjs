/**
 * Architecture rules: shared → (main | preload | renderer), one way.
 * Renderer windows (overlay, toolbar, panel) never import each other; what
 * they share lives in renderer/ui or shared.
 */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'shared-is-pure',
      comment: 'shared/ is imported by every process and must not depend on any of them.',
      severity: 'error',
      from: { path: '^src/shared' },
      to: { path: '^src/(main|preload|renderer)' },
    },
    {
      name: 'shared-no-electron-or-node',
      comment: 'shared/ runs in the sandboxed renderer too.',
      severity: 'error',
      from: { path: '^src/shared' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'processes-stay-apart',
      severity: 'error',
      from: { path: '^src/(main|preload|renderer)/' },
      to: { path: '^src/(main|preload|renderer)/', pathNot: '^src/$1/' },
    },
    {
      name: 'renderer-windows-stay-apart',
      severity: 'error',
      from: { path: '^src/renderer/(overlay|toolbar|panel)/' },
      to: { path: '^src/renderer/(overlay|toolbar|panel)/', pathNot: '^src/renderer/$1/' },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '.test.ts$' },
    tsConfig: { fileName: 'tsconfig.node.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.css'] },
  },
};

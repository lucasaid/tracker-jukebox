import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'

const LAYERS = ['net', 'formats', 'engine', 'audio', 'library', 'state', 'viz', 'ui']
// files in src/<from>/ may not import the listed src folders (matches '../engine' and '../engine/x')
const deny = (from, banned, extra = []) => ({
  files: [`src/${from}/**`],
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: [...banned.flatMap((b) => [`**/${b}`, `**/${b}/**`, `**/${b}.ts`]), ...extra] },
    ],
  },
})
const PURE = ['react', 'react-dom', 'react/*'] // must stay React-free (worklet + Node)
const others = (...allowed) => LAYERS.filter((l) => !allowed.includes(l))

export default tseslint.config(
  { ignores: ['dist', 'public', 'trackers', 'mockups', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Phase 0 stubs keep contract parameter names; `_` marks them unused until implemented
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  { files: ['src/**/*.tsx'], ...hooks.configs.flat.recommended },
  {
    files: ['src/net.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['./*', ...PURE] }] },
  },
  deny('formats', others('formats'), PURE),
  deny('engine', others('engine', 'formats'), PURE),
  deny('library', others('library', 'formats', 'net'), PURE),
  deny('audio', others('audio', 'engine', 'formats', 'net'), PURE),
  deny('viz', others('viz', 'engine', 'audio', 'formats')),
  deny('state', others('state', 'audio', 'engine', 'formats', 'library', 'net')),
  {
    files: ['scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/src/audio/**', '**/src/state/**', '**/src/viz/**', '**/src/ui/**'] },
      ],
    },
  },
)

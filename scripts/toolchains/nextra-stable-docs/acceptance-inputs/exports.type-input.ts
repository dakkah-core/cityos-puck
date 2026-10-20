// Compile in the parent's isolated native-catalog consumer bound to the
// generated candidate. Against upstream 4.6.1 the retired-API negatives must
// fail with unused @ts-expect-error, rather than module-resolution failure.
import nextra, { type NextraConfig } from 'nextra'
import { compileMdx } from 'nextra/compile'
import { Banner, Callout, Head } from 'nextra/components'
import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { getPageMap } from 'nextra/page-map'
import type { Config, Data, Field, PuckApi } from '@cityos-core/puck'
import * as CityOS from '@cityos-core/puck/cityos'

const disabled: NextraConfig = { latex: false }
const automaticKatex: NextraConfig = { latex: true }
const explicitKatex: NextraConfig = { latex: { renderer: 'katex', options: {} } }
nextra(disabled)
nextra(automaticKatex)
nextra(explicitKatex)
void compileMdx('$x$', explicitKatex)
void [Banner, Callout, Head, generateStaticParamsFor, importPage, getPageMap, CityOS]
export type ExistingPuckTypes = [Config, Data, Field, PuckApi]

// @ts-expect-error -- the owned variant intentionally retires this renderer
const retired: NextraConfig = { latex: { renderer: 'mathjax' } }
// @ts-expect-error -- retired upstream type must not survive in generated declarations
import type { MathJaxOptions } from 'nextra'
// @ts-expect-error -- retired upstream component exports must not survive
import { MathJax, MathJaxContext } from 'nextra/components'
void retired

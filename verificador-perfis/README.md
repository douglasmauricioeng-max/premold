# Verificador de Perfis Metálicos

Programa web para verificar barras de aço pela **ABNT NBR 8800:2008**. Abra o
`index.html` no navegador; não precisa instalar nada.

## O que o usuário escolhe

- **Perfil**: I/H laminado (catálogo W), I/H soldado, U (laminado ou soldado),
  tubo retangular/quadrado e tubo circular, com qualquer aço (fy, fu).
- **Barra e apoios**: comprimento, apoios em qualquer posição (móvel, fixo ou
  engaste, com ou sem trava lateral), modelos prontos (biapoiada, balanço,
  biengastada, engaste + apoio, dois vãos), contenções laterais, KxLx, KyLy,
  KzLz e Cb (automático ou informado).
- **Cargas**: quantas quiser, em qualquer posição: força concentrada, carga
  distribuída uniforme ou trapezoidal (trecho parcial), momento concentrado e
  força axial. Cada uma no plano vertical ou horizontal e classificada como
  permanente (G), variável de uso (Q) ou vento (W). O peso próprio é opcional.

## O que o programa calcula

- Combinações últimas normais (ELU) e raras (ELS), com coeficientes editáveis.
- Esforços N, V e M nos dois planos e deslocamentos (elementos finitos de viga;
  esforços obtidos por equilíbrio, exatos em qualquer seção).
- Tração (5.2), compressão com flambagem local, Q e flexo-torção (5.3, Anexo F),
  cortante (5.4.3), flexão com FLT, FLM e FLA (Anexo G), interação N + M
  (5.5.1.2) com amplificação B1, limites de esbeltez e flechas (Anexo C).
- Memorial de cálculo com os valores intermediários de cada verificação.

## Projetos

Cada projeto salvo tem um nome. Salvar com um nome novo cria outro projeto;
salvar com um nome já existente substitui aquele. Os projetos ficam no
navegador; use **Copiar JSON** / **Importar JSON** para guardá-los ou levá-los a
outro computador.

## Limitações

- Análise de 1ª ordem com B1 (Cm = 1,0); efeitos globais (B2) não são considerados.
- Perfis laminados: propriedades com dimensões nominais, sem as concordâncias
  (a favor da segurança). Confira com o catálogo do fabricante.
- Almas esbeltas (Anexo H), perfis formados a frio (NBR 14762), cantoneiras e
  ligações não são verificados.

## Testes

```
node testes/testes.js
```

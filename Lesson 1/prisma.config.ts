import { defineConfig } from 'prisma/config'

export default defineConfig({
  datasourceUrl: 'file:./prisma/dev.db',
})

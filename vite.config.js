import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: './' — обязательно относительные пути, иначе на GitHub Pages
// в подпапке (username.github.io/repo/) ассеты из /assets не найдутся.
//
// Сборка собирается и выкладывается GitHub Actions (.github/workflows/deploy.yml) и в репозиторий
// не попадает, поэтому имена файлов снова с хешем: любое изменение раздела меняет имя его файла, и
// браузер не возьмёт из кэша старый кусок к новому главному файлу.
//
// Куски называются по разделу — «notes-ui-a1b2c3.js», а не «ui3.js»: у Rollup одинаковые имена
// получают номер по порядку сборки, и номер переезжает на другой раздел при любом изменении.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) => {
          const id = chunk.facadeModuleId || "";
          const m = id.match(/src[\\/](\w+)[\\/]([\w-]+)\.jsx?$/);
          return m ? `assets/${m[1]}-${m[2]}-[hash].js` : "assets/[name]-[hash].js";
        },
      },
    },
  },
});

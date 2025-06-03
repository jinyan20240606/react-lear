import autohue from './autohue-kmeans.js';
// import autohue from "./autohue";
autohue(
  "https://auto-plugin.github.io/autohue.js/imgs/flower-9221176_1280.jpg",
  { threshold: { primary: 10, left: 1, right: 1 } }
).then((res) => {
  console.log(res);
  const { top, right, left, bottom } = res.backgroundColor;
  document.querySelector(".color-show.right1").style.background = right;
  document.querySelector(".color-show.right1").style.background = right;
  document.querySelector(".color-show.main1").style.background =
    res.primaryColor;
});

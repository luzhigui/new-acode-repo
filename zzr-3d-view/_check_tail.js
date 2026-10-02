
function toggleAR(b){
  controls.autoRotate = !controls.autoRotate;
  b.classList.toggle('on', controls.autoRotate);
}
init();

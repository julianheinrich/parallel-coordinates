var pc = function(selection, renderer) {
  selection = pc.selection = d3.select(selection);
  renderer = renderer || "canvas";

  __.width = selection[0][0].clientWidth;
  __.height = selection[0][0].clientHeight;

  // canvas data layers
  pc.renderType(renderer);  

  return pc;
};

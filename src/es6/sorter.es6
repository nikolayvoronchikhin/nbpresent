import d3 from "d3";
import uuid from "node-uuid";

import Jupyter from "base/js/namespace";

import {Editor} from "./editor";
import {Toolbar} from "./toolbar";
import {PART} from "./parts";
import {MiniSlide} from "./mini";
import {LayoutLibrary} from "./layouts";

let REMOVED = "<removed>";

class Sorter {
  constructor(tree) {
    this.tree = tree;

    this.layoutPicked = this.layoutPicked.bind(this);

    this.visible = this.tree.select(["sorter", "visible"]);
    this.visible.set(false);

    this.slides = this.tree.select(["slides"]);
    this.selectedSlide = this.tree.select(["sorter", "selectedSlide"]);
    this.selectedRegion = this.tree.select(["sorter", "selectedRegion"]);

    this.selectedSlide.on("update", () => this.updateSelectedSlide());
    this.selectedRegion.on("update", () => this.updateSelectedRegion());
    this.slides.on("update", () => this.draw());

    this.scale = {
      x: d3.scale.linear()
    };

    this.mini = new MiniSlide(this.selectedRegion);

    this.drawn = false;
  }

  show(){
    if(!this.drawn){
      this.initUI();
      this.drawn = true;
    }

    this.selectedSlide.set(null);
    this.selectedRegion.set(null);

    let visible = this.visible.set(!this.visible.get());
    this.update();
    if(this.visible){
      this.draw();
    }
  }

  update(){
    let visible = this.visible.get();
    this.$view
      .classed({offscreen: !visible})
      .style({
        // necessary for FOUC
        "display": visible ? "block" : "none"
      });

    d3.select("#notebook")
      .style({
        "margin-bottom": visible ? "100px" : null
      });
  }

  initUI(){
    this.$view = d3.select("body")
      .append("div")
      .classed({
        nbpresent_sorter: 1,
        offscreen: 1
      })
      .style({
        display: "none"
      });

    this.$slides = this.$view.append("div")
      .classed({slides_wrap: 1});

    let $brand = this.$view.append("h4")
      .classed({nbpresent_brand: 1})
      .append("a")
      .attr({
        href: "https://continuumio.github.io/nbpresent/",
        target: "_blank"
      })

    $brand.append("i")
      .attr("class", "fa fa-fw fa-gift");

    $brand.append("span")
      .text("nbpresent");

    this.$empty = this.$slides.append("h3")
      .classed({empty: 1})
      .text("No slides yet.");

    this.initToolbar();
    this.initDrag();
  }

  initDrag(){
    let that = this,
      dragOrigin;

    this.drag = d3.behavior.drag()
      .on("dragstart", function(d){
        let slide = d3.select(this)
          .classed({dragging: 1});

        dragOrigin = parseFloat(slide.style("left"));
      })
      .on("drag", function(d){
        d3.select(this)
          .style({
            left: `${dragOrigin += d3.event.dx}px`,
          });
      })
      .on("dragend", function(d, i){
        let $slide = d3.select(this)
          .classed({dragging: 0});

        let left = parseFloat($slide.style("left")),
          slides = that.tree.get("sortedSlides"),
          slideN = Math.floor(left / that.slideWidth()),
          after;

        if(left < that.slideWidth() || slideN < 0){
          after = null;
        }else if(slideN > slides.length || !slides[slideN]){
          after = slides.slice(-1)[0].key;
        }else{
          after = slides[slideN].key;
        }

        if(d.key !== after){
          that.unlinkSlide(d.key);
          that.selectedSlide.set(that.appendSlide(after, d.key));
        }else{
          that.draw();
        }
      });
  }

  // TODO: make these d3 scales!
  slideHeight() {
    return 100;
  }

  slideWidth(){
    return 200;
  }

  draw(){
    let that = this;

    let slides = this.tree.get("sortedSlides");

    this.scale.x.range([0, this.slideWidth()]);

    let $slide = this.$slides.selectAll(".slide")
      .data(slides, (d) => d.key);

    $slide.enter().append("div")
      .classed({slide: 1})
      .call(this.drag)
      .on("mousedown", function(d){
        that.selectedSlide.set(
          that.selectedSlide.get() === d.key ? null : d.key
        );
      });

    $slide.exit()
      .transition()
      .style({
        top: "200px"
      })
      .remove();

    let selectedSlide = this.selectedSlide.get(),
      selectedRegion = this.selectedRegion.get(),
      selectedSlideLeft;

    $slide
      .style({
        "z-index": (d, i) => i
      })
      .classed({
        active: (d) => d.key === selectedSlide
      })
      .transition()
      .delay((d, i) => i * 10)
      .style({
        left: (d, i) => {
          let left = this.scale.x(i);
          if(d.key === selectedSlide){
            selectedSlideLeft = left;
            this.$slideToolbar
              .transition()
              .style({
                left: `${selectedSlideLeft}px`,
                opacity: 1,
                display: "block"
              });
          }
          return `${left}px`;
        }
      });

    $slide.call(this.mini.update);

    this.$regionToolbar
      .transition()
      .style({
        opacity: selectedRegion ? 1 : 0,
        display: selectedRegion ? "block" : "none",
        left: `${selectedSlideLeft}px`
      });

    this.$empty
      .transition()
      .style({opacity: 1 * !$slide[0].length })
      .transition()
      .style({display: $slide[0].length ? "none": "block"});
  }

  updateSelectedRegion(){
    let {slide, region} = this.selectedRegion.get() || {};
    if(region){
      this.selectedSlide.set(slide);
      let content = this.slides.get(
        [slide, "regions", region, "content"]);
      if(content){
        this.selectCell(content.cell);
      }
    }else{
      this.$regionToolbar.transition()
        .style({opacity: 0})
        .transition()
        .style({display: "none"});
    }
    this.draw();
  }

  // TODO: move this to the cell manager?
  selectCell(id){
    let cell = Jupyter.notebook.get_cells().filter(function(cell, idx){
      if(cell.metadata.nbpresent && cell.metadata.nbpresent.id == id){
        Jupyter.notebook.select(idx);
      };
    });
  }

  updateSelectedSlide(){
    let slide = this.selectedSlide.get(),
      selected = this.selectedRegion.get() || {};

    if(!slide){
      this.$slideToolbar.transition()
        .style({opacity: 0})
        .transition()
        .style({display: "none"});
    }
    if(selected.slide != slide){
      console.log("reset", selected.slide, slide);
      this.selectedRegion.set(null);
    }

    this.draw();
    if(this.editor){
      this.editSlide(slide);
    }
  }


  initToolbar(){
    this.deckToolbar = new Toolbar()
      .btnGroupClass("btn-group-vertical")
      .btnClass("btn-default btn-lg");
    this.$deckToolbar = this.$view.append("div")
      .classed({deck_toolbar: 1})
      .datum([
        [{
          icon: "plus-square-o",
          click: () => this.addSlide(),
          tip: "Add Slide"
        }]
      ])
      .call(this.deckToolbar.update);

    this.slideToolbar = new Toolbar();
    this.$slideToolbar = this.$slides.append("div")
      .classed({slide_toolbar: 1})
      .datum([
        [{
          icon: "edit",
          click: () => this.editSlide(this.selectedSlide.get()),
          tip: "Edit Slide"
        }, {
          icon: "trash",
          click: () => {
            this.removeSlide(this.selectedSlide.get());
            this.selectedSlide.set(null);
          },
          tip: "Delete Slide"
        }]
      ])
      .call(this.slideToolbar.update);

    this.regionToolbar = new Toolbar();
    this.$regionToolbar = this.$slides.append("div")
      .classed({region_toolbar: 1})
      .datum([
        [{
          icon: "external-link-square",
          click: () => this.linkContent(PART.source),
          tip: "Link Region to Cell Input"
        },
        {
          icon: "external-link",
          click: () => this.linkContent(PART.outputs),
          tip: "Link Region to Cell Output"
        },
        {
          icon: "sliders",
          click: () => this.linkContent(PART.widgets),
          tip: "Link Region to Cell Widgets"
        },
        {
          icon: "unlink",
          click: () => this.linkContent(null),
          tip: "Unlink Region"
        }]
      ])
      .call(this.regionToolbar.update);
  }

  linkContent(part){
    let {slide, region} = this.selectedRegion.get() || {},
      cell = Jupyter.notebook.get_selected_cell(),
      cellId;

    if(!(region && cell)){
      return;
    }

    if(part){
      if(!cell.metadata.nbpresent){
        cell.metadata.nbpresent = {id: this.nextId()};
      }

      cellId = cell.metadata.nbpresent.id;

      this.slides.set([slide, "regions", region, "content"], {
        cell: cellId,
        part
      });
    }else{
      this.slides.unset([slide, "regions", region, "content"]);
    }
  }

  addSlide(){
    if(!this.layouts || this.layouts.killed){
      this.layouts = new LayoutLibrary(this.layoutPicked);
    }else{
      this.layouts.destroy();
      this.layouts = null;
    }
  }

  layoutPicked(slide){

    let last = this.tree.get("sortedSlides").slice(-1),
      selected = this.selectedSlide.get();

    this.slides.set([slide.key], slide.value);

    let appended = this.appendSlide(
        selected ? selected : last.length ? last[0].key : null,
        slide.key
      );

    this.selectedSlide.set(appended);

    this.layouts.destroy();
    this.layouts = null;
  }

  editSlide(id){
    if(this.editor){
      if(this.editor.slide.get("id") === id){
        id = null;
      }
      this.editor.destroy();
      this.editor = null;
    }

    if(!id){
      return;
    }
    // TODO: do this with an id and big tree ref?
    this.editor = new Editor(this.slides.select(id), this.selectedRegion);
  }

  nextId(){
    return uuid.v4();
  }

  unlinkSlide(id){
    let {prev} = this.slides.get(id),
      next = this.nextSlide(id);

    next && this.slides.set([next, "prev"], prev);
    this.slides.set([id, "prev"], REMOVED);
  }

  removeSlide(id){
    if(!id){
      return;
    }
    this.unlinkSlide(id);
    this.slides.unset(id);
  }

  nextSlide(id){
    let slides = this.tree.get("sortedSlides"),
      next = slides.filter((d) => d.value.prev === id);

    return next.length ? next[0].key : null;
  }

  newSlide(id, prev){
    return {
      id,
      prev,
      regions: {}
    }
  }

  appendSlide(prev, id=null){
    let next = this.nextSlide(prev);

    if(!id){
      id = this.nextId();
      this.slides.set(id, this.newSlide(id, prev));
    }else{
      this.slides.set([id, "prev"], prev);
    }

    next && this.slides.set([next, "prev"], id);

    return id;
  }
}

export {Sorter};
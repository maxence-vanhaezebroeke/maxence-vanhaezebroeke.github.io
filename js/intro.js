$(document).ready(function () {

    var elem = document.querySelector("body");
    elem.style.overflow = "hidden";

    setTimeout(function () {
      $('body').addClass('loaded');
    }, 1500);

    setTimeout(function () {
      $("body").css({"overflow":""});
    }, 2500);
});
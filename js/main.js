window.onload = function() {
    
    for(let hmt of document.querySelectorAll('.hidden_menu_text')) hmt.style.visibility = "hidden";
}


let navbar = document.getElementById("nav_bar");

navbar.addEventListener("mouseover", () => {

    var arrayOfElements=document.getElementsByClassName('onglet');
    var lengthOfArray=arrayOfElements.length;

    for (var i=0; i<lengthOfArray;i++){
        arrayOfElements[i].style.display='block';
    }
});

navbar.addEventListener("mouseout", () => {

    var arrayOfElements=document.getElementsByClassName('onglet');
    var lengthOfArray=arrayOfElements.length;
    
    for (var i=0; i<lengthOfArray;i++){
        arrayOfElements[i].style.display='none';
    }
});

function validateEmail(mail) {
    var re = /\S+@\S+\.\S+/;
    return re.test(mail);
}

let message = document.getElementById("message");
let email = document.getElementById("mail");
let sujet = document.getElementById("sujet");
let button = document.getElementById("envoie");
let check1;
let check2;
let check3;

button.addEventListener("click", (event) => {
    event.preventDefault();
    if(!validateEmail(email.value))
        document.getElementById("error1").textContent = "Email non valide";
    else{
        document.getElementById("error1").textContent = "";
        check1 = true;
    }
    if(sujet.value.length < 4)
        document.getElementById("error2").textContent = "Sujet trop court";
    else{
        document.getElementById("error2").textContent = "";
        check2 = true;
    }
    if(message.value.length < 10)
        document.getElementById("error3").textContent = "Le message est trop court";
    else{
        document.getElementById("error3").textContent = "";
        check3 = true;
    }

    if(check1 && check2 && check3){
        var http = new XMLHttpRequest();
        var url = 'mail.php';
        var params = 'mail='+email.value+'&message='+message.value+'&sujet='+sujet.value;
        http.open('POST', url, true);

        http.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

        http.onreadystatechange = function() {
            if(http.readyState == 4 && http.status == 200) {
                email.value = "";
                sujet.value = "";
                message.value = "";
                check1 = false;
                check2 = false;
                check3 = false;
                Swal.fire({
                    title: 'Succès',
                    text: 'Votre message a bien été envoyé !',
                    icon: 'success',
                    confirmButtonText: 'Cool'
                });
            }
        }
        http.send(params);
    }
});
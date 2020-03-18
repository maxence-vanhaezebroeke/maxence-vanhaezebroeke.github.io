<?php
    $email = $_POST['mail'];
    $message = $_POST['message'];
    $subject = $_POST['sujet'];
    header('Content-Type: application/json');
    if ($message === '' || $email === '' || $subject === ''){
        exit();
    }
    $content="From: email: $email \nMessage: $message";
    $recipient = "thomas.deasington@etu.u-bordeaux.fr";
    $mailheader = "From: $email \r\n";
    mail($recipient, $subject, $content);
    echo("email".$email);
    echo("message".$message);
    echo("sujet".$subject);
    exit();
?>
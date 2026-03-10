package com.example.controller;

import com.example.service.UserService;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
public class UserController {
    
    private UserService userService;
    
    @GetMapping("/user/{id}")
    public UserVO getUser(@PathVariable Long id) {
        return userService.getUser(id);
    }
    
    @GetMapping("/user/{id}/delete")
    public void deleteUser(@PathVariable Long id) {
        userService.deleteUser(id);
    }
}

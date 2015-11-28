
//=============================================================================
/*:
 * @plugindesc Skill Proficiency
 * @author BlackRaison

 *==================TAGS==================
	<Rank:n>
	<MaxLevel:n>

 *
 * @param Level Up Base Requirement
 * @desc The amount of proficiency required to get the first level
 * Default: 30
 * @default 30
 *
 * @param Percentage Increase Per Level
 * @desc The amount the levelling requirement increases by each time
 * Default: 10
 * @default 10
 *
 * @param Unapplicable Skills
 * @desc Skills that do not have a proficiency
 * Default: 2 -> Attack and Guard do not have proficiency
 * @default 2
 */



(function(){

	var BlkRaison = BlkRaison || {};

	BlkRaison.Parameters = PluginManager.parameters('BLKR_SkillProficiency');
	BlkRaison.Param = BlkRaison.Param || {};

	BlkRaison.Param.LevelUpBaseRequirement = Number(BlkRaison.Parameters['Level Up Base Requirement']);
	BlkRaison.Param.PercentageIncreasePerLevel = Number(BlkRaison.Parameters['Percentage Increase Per Level']);
	BlkRaison.Param.UnapplicableSkills = Number(BlkRaison.Parameters['Unapplicable Skills']);

	_BLKR_SP_Game_Actor_initSkills = Game_Actor.prototype.initSkills;
	Game_Actor.prototype.initSkills = function() {
		_BLKR_SP_Game_Actor_initSkills.call(this);
		this._skillsProficiency = [];
		this._skillsLevel = [];
		this._skills.forEach(function(skill){
			this._skillsProficiency.push(0);
			this._skillsLevel.push(0);
		},this);
	};

	Game_Actor.prototype.updateSkillProficiency = function(skillId) {
		var rank;
		var exp;
		var max;
		var i = this._skills.indexOf(skillId);
		if (i > -1){
			if($dataSkills[skillId].meta){
				rank = parseInt($dataSkills[skillId].meta.Rank);
				max = parseInt($dataSkills[skillId].meta.MaxLevel);
				exp = parseInt(this._skillsProficiency[i]);
			}
			else{
				rank = 0;
				max = 0;
			}

			if (typeof rank === "undefined"){
				rank = 0;
			}
			if (typeof max === "undefined"){
				max = 0;
			}

			if (max > this._skillsLevel[i]){
				exp = _BLKR_ProficiencyCurve(rank, this._skillsLevel[i], exp);	
				if (exp === -1){ //Level up
					this._skillsProficiency[i] = 0;
					this._skillsLevel[i] += 1;
				}
				else{
					this._skillsProficiency[i] = exp;
				}
			}
		}
	};

	_BLKR_SP_Game_Actor_learnSkill = Game_Actor.prototype.learnSkill;
	Game_Actor.prototype.learnSkill = function(skillId) {
		_BLKR_SP_Game_Actor_learnSkill.call(this, skillId);
	    if (!this.isLearnedSkill(skillId)) {
	        var index = this._skills.indexOf(skillId);
	        this._skillsProficiency.splice(index, 0, 0);
	        this._skillsLevel.splice(index, 0, 0);
	    }
	};

	_BLKR_SP_GAME_ACTOR_forgetSkill = Game_Actor.prototype.forgetSkill;
	Game_Actor.prototype.forgetSkill = function(skillId) {
	    var index = this._skills.indexOf(skillId);
	    if (index >= 0) {
	        this._skillsProficiency.splice(index, 1);
	        this._skillsLevel.splice(index, 1);
	    }
	    _BLKR_SP_GAME_ACTOR_forgetSkill.call(this,skillId);
	};

	Game_Actor.prototype.getProficiencyNormalized = function(skillId) {
		var rank;
		var exp;
		var i = this._skills.indexOf(skillId);
		if (i > -1){
			
			if ($dataSkills[skillId].meta.MaxLevel == this._skillsLevel[i]){
				return 1;
			}

			if($dataSkills[skillId].meta){
				rank = parseInt($dataSkills[skillId].meta.Rank);
				exp = parseInt(this._skillsProficiency[i]);
			}
			var amt = _BLKR_ProficiencyEquation(rank,this._skillsLevel[i]);
			return (exp/amt);
		}
	};

	Game_Actor.prototype.getProficiencyLevel = function(skillId){
		var i = this._skills.indexOf(skillId);
		if (i > -1){
			var level = this._skillsLevel[i];
			var max = $dataSkills[skillId].meta.MaxLevel;
			if (max == level){
				return "MAX";
			}
		return ("Lv " + this._skillsLevel[i]);
		}
	};

	var _BLKR_ProficiencyEquation = function(rank, level){
		return Math.floor(BlkRaison.Param.LevelUpBaseRequirement * Math.pow(1 + (BlkRaison.Param.PercentageIncreasePerLevel)/100, level));
	}

	var _BLKR_ProficiencyCurve = function(rank,level,exp){
		var requiredAmount = _BLKR_ProficiencyEquation(rank,level);
		var randomProficiencyNum = Math.random() + 1;
		if (rank === 0){
			rank = 1;
		}
		exp += randomProficiencyNum * (1.5 / rank);
		if (exp >= requiredAmount){
			exp = -1;
		}
		return exp;

	};

	//increase proficiency when skill is used during battle
	_BLKR_SP_BattleManager_endAction = BattleManager.endAction;
	BattleManager.endAction = function() {
		_BLKR_SP_BattleManager_endAction.call(this);
			
		var curActor = this._subject;
		var skill = this._action._item;

		if (skill._dataClass === "skill" && curActor != null){
			if (skill._itemId > BlkRaison.Param.UnapplicableSkills){ //NOT ATTACK OR GUARD
				if (curActor.isActor()){
					curActor.updateSkillProficiency(skill._itemId);	
				}
			}
		}
	};

	//increase proficiency when skill is used during menu
	_BLKR_SP_Scene_Skill_useItem = Scene_Skill.prototype.useItem;
    Scene_Skill.prototype.useItem = function() {
    		_BLKR_SP_Scene_Skill_useItem.call(this);
    		var actor = this._itemWindow._actor;
    		actor.updateSkillProficiency(actor.lastMenuSkill().id);
    };

    //increase effectiveness of higher ranking skills
    Game_Action.prototype.evalDamageFormula = function(target) {
	    try {
	        var item = this.item();
	        var a = this.subject();
	        var b = target;
	        if (a.isActor()){
	       		var plevel = a._skillsLevel[a.skills().indexOf(item)] + 1;
	        }
	        var v = $gameVariables._data;
	        var sign = ([3, 4].contains(item.damage.type) ? -1 : 1);
	        return Math.max(eval(item.damage.formula), 0) * sign;
	    } catch (e) {
	        return 0;
	    }
	};

	//=====================================UI========================================//
	//===The following modify the DEFAULT Skill screen to include appropriate bars===//
	//===============================================================================//

	Window_SkillList.prototype.maxCols = function() {
		return 1;
	};

    Window_SkillList.prototype.drawSkillProficiency = function(actor, skillId, x, y, width) {
        var color1 = "#eeee00";
        var color2 = "#ffff00";
        this.drawGauge(x+Graphics.width - width/3 - 30, y, width/3, actor.getProficiencyNormalized(skillId), color1, color2);
        this.changeTextColor(this.systemColor());
        this.drawText(actor.getProficiencyLevel(skillId), x+Graphics.width - width/3 - this.costWidth() , y, 44);
    };

    Window_SkillList.prototype.drawItem = function(index) {
	    var skill = this._data[index];
	    if (skill) {
	        var costWidth = this.costWidth();
	        var rect = this.itemRect(index);
	        rect.width -= this.textPadding();
	        this.changePaintOpacity(this.isEnabled(skill));
	        this.drawItemName(skill, rect.x, rect.y, rect.width - costWidth);
	        this.drawSkillCost(skill, rect.x, rect.y, rect.width/2 - costWidth);
	       	if (!$gameParty.inBattle()){
	       		this.drawSkillProficiency(this._actor, skill.id, rect.x, rect.y, rect.width);	
	       	}
	        this.changePaintOpacity(1);
    	};
	};

	//PLUGIN COMMANDS
	_BLKR_SP_Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
	Game_Interpreter.prototype.pluginCommand = function(command, args) {
	    // to be overridden by plugins
	    if (command === 'SkillProficiencySetLevel'){ // args[0] = actor ID // args[1] = skillID // args[2] = level
	    	var actorId = parseInt(args[0]);
	    	var skillId = parseInt(args[1]);
	    	var skillLevel = parseInt(args[2]);

	    	var members = $gameParty.allMembers();
	    	var actor;
	    	for (var i = 0; i < members.length; i++){
	    		console.log(members[i]._actorId);
	    		if (members[i]._actorId === actorId){
	    			actor = members[i];
	    			break;
	    		}
	    	}
	    	console.log(actor._skills.indexOf(skillId));
	    	var index = actor._skills.indexOf(skillId);
	    	console.log(actor._skillsLevel[index]);
	    	var max = parseInt($dataSkills[skillId].meta.MaxLevel);
	    	actor._skillsLevel[index] = Math.min(skillLevel,max);

	    }	
	};



})();